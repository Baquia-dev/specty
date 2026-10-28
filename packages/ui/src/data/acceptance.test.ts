// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { evidenceOf, summaryOf } from "./acceptance";
import { FixtureData, sampleRecords } from "./fixtures";
import type { TaskProgressView } from "./progress";
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { decideResultIn } from "./sample-acceptance";
import { deriveViews } from "./views";

const ASISTENCIA = "20261018-asistencia-curso";
const NOW = Date.parse("2026-10-22T12:00:00Z");

function task(id: string, extra: Partial<TaskProgressView> = {}): TaskProgressView {
  return {
    id,
    title: `Tarea ${id}`,
    status: "done",
    files: [],
    criteria: ["AC1"],
    attempts: 1,
    scopeRequests: [],
    ...extra,
  };
}

const passed = {
  at: "2026-10-22T11:00:00Z",
  command: "flutter test",
  passed: true,
  ms: 1_000,
  output: [],
};
const criterion = (id: string) => ({ id, text: `Criterio ${id}`, warnings: [] });

function source(): FixtureData {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [FixtureData] });
  return TestBed.inject(FixtureData);
}

async function record(fixtures: FixtureData, id = ASISTENCIA): Promise<ChangeRecord> {
  const found = (await fixtures.changes()).find((item) => item.state.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

/** A source with nothing of its own: every action is refused as read-only. */
@Injectable()
class Bare extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

describe("acceptance evidence", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("tells for each criterion how far the tasks covering it go", () => {
    const tasks = [
      task("T1", { commit: "a1", verification: passed }),
      task("T2", { commit: "b2", criteria: ["AC1", "AC2"] }),
      task("T3", { status: "active", criteria: ["AC3"] }),
    ];
    const evidence = evidenceOf(["AC1", "AC2", "AC3", "AC4"].map(criterion), tasks);
    expect(evidence.map((item) => [item.id, item.status, item.tasks.map((t) => t.id)])).toEqual([
      ["AC1", "unverified", ["T1", "T2"]],
      ["AC2", "unverified", ["T2"]],
      ["AC3", "pending", ["T3"]],
      ["AC4", "uncovered", []],
    ]);
    expect(evidenceOf([criterion("AC1")], [tasks[0] ?? task("T0")])[0]?.status).toBe("verified");
    expect(summaryOf(evidence, tasks)).toEqual({
      verified: 0,
      criteria: 4,
      done: 2,
      tasks: 3,
      commits: 2,
    });
  });

  it("AC1: gives each criterion its tests, at most 3, and says which are by hand or owe a test", () => {
    const line = (n: number) => ({ path: "test/a_test.dart", line: n, task: "T1", commit: "a1" });
    const criteriaTests = [
      { id: "AC1", manual: false, owed: true, tests: [1, 2, 3, 4].map(line) },
      { id: "AC2", manual: false, owed: true, tests: [] },
      { id: "AC3", manual: true, owed: false, tests: [] },
      { id: "AC4", manual: false, owed: false, tests: [] },
    ];
    const criteria = [
      criterion("AC1"),
      criterion("AC2"),
      { ...criterion("AC3"), manual: true as const },
      criterion("AC4"),
    ];
    const evidence = evidenceOf(criteria, [task("T1")], criteriaTests);
    expect(
      evidence.map(({ id, tests, more, manual, untested }) => ({
        id,
        tests,
        more,
        manual,
        untested,
      })),
    ).toEqual([
      { id: "AC1", tests: [1, 2, 3].map(line), more: 1, manual: undefined, untested: undefined },
      { id: "AC2", tests: [], more: 0, manual: undefined, untested: true },
      { id: "AC3", tests: [], more: 0, manual: true, untested: undefined },
      { id: "AC4", tests: [], more: 0, manual: undefined, untested: undefined },
    ]);
    // Without the server's tests, only what the spec says: AC3 by hand.
    const bare = evidenceOf(criteria, [task("T1")]);
    expect(bare.map((item) => [item.tests, item.manual, item.untested])).toEqual([
      [undefined, undefined, undefined],
      [undefined, undefined, undefined],
      [undefined, true, undefined],
      [undefined, undefined, undefined],
    ]);
  });

  it("finds the sample in acceptance fully verified, from its commits and audit (AC1)", () => {
    const view = deriveViews(sampleRecords(NOW)).find((item) => item.id === ASISTENCIA);
    if (view === undefined) throw new Error("no sample");
    const evidence = evidenceOf(view.review.criteria, view.progress.tasks);
    expect(evidence.map((item) => [item.id, item.status, item.tasks.map((t) => t.commit)])).toEqual(
      [
        ["AC1", "verified", ["3c9d1e2", "8b0a4f6"]],
        ["AC2", "verified", ["8b0a4f6"]],
      ],
    );
    const panel = evidence[1]?.tasks[0];
    expect([panel?.attempts, panel?.verification?.ms, panel?.verification?.passed]).toEqual([
      2,
      21_000,
      true,
    ]);
    expect(summaryOf(evidence, view.progress.tasks)).toEqual({
      verified: 2,
      criteria: 2,
      done: 2,
      tasks: 2,
      commits: 2,
    });
  });
});

describe("deciding on the result", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("asks for adjustments with the literal request, as `specty adjust` (AC5)", async () => {
    const fixtures = source();
    const heard = vi.fn();
    fixtures.subscribe(heard);
    await fixtures.decideResult(ASISTENCIA, { kind: "adjust", request: "  AC2: no se destaca.  " });
    const { state, audit } = await record(fixtures);
    expect(state.phase).toBe("adjusting");
    expect(state.pending.adjustment?.request).toBe("AC2: no se destaca.");
    expect(audit?.at(-1)).toMatchObject({
      actor: "human",
      event: "adjust.requested",
      data: { request: "AC2: no se destaca." },
    });
    expect(heard).toHaveBeenCalled();
  });

  it("refuses an empty request and a change that no longer waits (AC5, AC6)", async () => {
    const fixtures = source();
    await expect(
      fixtures.decideResult(ASISTENCIA, { kind: "adjust", request: "   " }),
    ).rejects.toBeInstanceOf(ActionError);
    expect((await record(fixtures)).state.phase).toBe("acceptance");
    await fixtures.decideResult(ASISTENCIA, { kind: "accept" });
    await expect(fixtures.decideResult(ASISTENCIA, { kind: "accept" })).rejects.toMatchObject({
      text: { es: "Este cambio ya no espera que aceptes el resultado." },
    });
  });

  it("moves an accepted change on to its closing, and closes a quick one (AC4)", async () => {
    const fixtures = source();
    await fixtures.decideResult(ASISTENCIA, { kind: "accept" });
    const accepted = await record(fixtures);
    expect(accepted.state.phase).toBe("closing");
    expect(accepted.audit?.at(-1)).toMatchObject({
      actor: "human",
      event: "change.accepted",
      data: { revision: 1 },
    });
    const quick: ChangeRecord = {
      ...accepted,
      state: { ...accepted.state, kind: "quick", phase: "acceptance" },
    };
    const closed = decideResultIn(quick, { kind: "accept" }, NOW);
    expect(closed.state.phase).toBe("done");
    expect(closed.phaseSince).toBe(new Date(NOW).toISOString());
    expect(closed.audit?.at(-1)).toMatchObject({ event: "change.closed", data: { lane: "quick" } });
  });

  it("is read-only in a source that does not implement it (AC6)", async () => {
    TestBed.configureTestingModule({ providers: [Bare] });
    await expect(
      TestBed.inject(Bare).decideResult(ASISTENCIA, { kind: "accept" }),
    ).rejects.toBeInstanceOf(ActionError);
  });
});
