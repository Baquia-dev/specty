// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { FixtureData, sampleRecords } from "./fixtures";
import type { RunRecord } from "./progress";
import { RunSimulation, runTarget, STEP_MS, verifiedIn } from "./sample-run";

const PDF = "20261019-boletines-pdf";

function source(): FixtureData {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [FixtureData] });
  return TestBed.inject(FixtureData);
}

describe("simulated verification", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("verifies the task in progress; it fails while it waits for the file it asked for", () => {
    const records = sampleRecords(Date.parse("2026-10-22T12:00:00Z"));
    expect(runTarget(records)).toEqual({
      change: PDF,
      task: "T3",
      command: "flutter test test/reports",
      passes: false,
      missing: "lib/shared/pdf/layout.dart",
    });
    const withoutRequest = records.map((record) =>
      record.state.id === PDF
        ? {
            ...record,
            state: { ...record.state, pending: { scopeRequests: [], adjustment: null } },
          }
        : record,
    );
    expect(runTarget(withoutRequest)).toMatchObject({ task: "T3", passes: true });
    expect(runTarget([])).toBeUndefined();
  });

  it("streams a run line by line to who watches, then reports its result (AC1, AC3)", () => {
    vi.useFakeTimers();
    const done = vi.fn<(change: string, run: RunRecord, passed: boolean) => void>();
    const runs = new RunSimulation(done);
    const seen: (number | undefined)[] = [];
    const stop = runs.watch("c", (run) => seen.push(run?.output.length));
    runs.start({ change: "c", task: "T1", command: "flutter test test/x", passes: true });
    // A second start on the same change goes on with the first run.
    runs.start({ change: "c", task: "T2", command: "other", passes: false });
    vi.advanceTimersByTime(STEP_MS * 3);
    expect(seen).toEqual([undefined, 0, 1, 2, 3]);
    vi.advanceTimersByTime(STEP_MS * 20);
    expect(done).toHaveBeenCalledTimes(1);
    const [change, run, passed] = done.mock.calls[0] ?? [];
    expect([change, run?.task, passed]).toEqual(["c", "T1", true]);
    expect(run?.output.at(-1)).toBe("00:06 +6: All tests passed!");
    expect(seen.at(-1)).toBeUndefined();
    // Whoever stopped watching hears nothing more.
    stop();
    runs.start({ change: "c", task: "T1", command: "flutter test", passes: true });
    vi.advanceTimersByTime(STEP_MS);
    expect(seen.at(-1)).toBeUndefined();
  });

  it("leaves one more attempt and a task.verified event, with the failure's last lines", () => {
    const [record] = sampleRecords(Date.parse("2026-10-22T12:00:00Z")).filter(
      (item) => item.state.id === PDF,
    );
    if (record === undefined) throw new Error("no sample");
    const output = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`);
    const run: RunRecord = {
      task: "T3",
      command: "flutter test test/reports",
      startedAt: "2026-10-22T12:00:00Z",
      output,
    };
    const failed = verifiedIn(record, run, false, Date.parse("2026-10-22T12:00:08Z"));
    expect(failed.state.tasks[run.task]?.attempts).toBe(2);
    expect(failed.audit?.at(-1)).toMatchObject({
      actor: "specty",
      event: "task.verified",
      data: { task: "T3", exit: 1, ms: 8_000, outputTail: output.slice(-10) },
    });
    const passed = verifiedIn(record, run, true, Date.parse("2026-10-22T12:00:08Z"));
    expect(passed.audit?.at(-1)?.data).not.toHaveProperty("outputTail");
  });

  it("runs from the sample source: live lines, then the result in the record (AC1, AC3)", async () => {
    vi.useFakeTimers();
    const fixtures = source();
    const lines: (number | undefined)[] = [];
    fixtures.watchRun(PDF, (run) => lines.push(run?.output.length));
    fixtures.startRun();
    vi.advanceTimersByTime(STEP_MS * 2);
    expect(lines).toEqual([undefined, 0, 1, 2]);
    vi.advanceTimersByTime(STEP_MS * 20);
    expect(lines.at(-1)).toBeUndefined();
    const record = (await fixtures.changes()).find((item) => item.state.id === PDF);
    expect(record?.audit?.at(-1)?.data).toMatchObject({ task: "T3", exit: 1 });
  });
});
