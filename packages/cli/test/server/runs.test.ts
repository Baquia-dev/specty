// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeRuns, type Run } from "../../src/server/runs";
import { clearRun, writeRun } from "../../src/store/runs";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  NOW,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "../support";
import { implemented, sessionAt } from "./support";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Waits, in real time, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await wait(20);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the runs of a change in the local server", () => {
  it("end once, with the full verification's result already in the audit", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}  full: "true"\n` });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await implemented(root, "1\n", "2\n");
    const session = await sessionAt(root, AGENT);
    const audit = join(root, ".specty", "changes", CHANGE, "audit.jsonl");
    const heard: { readonly run: Run | undefined; readonly recorded: boolean }[] = [];
    // The watcher of the tasks' runs looks only when the test says.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const runs = changeRuns(session, (id, run) => {
      const recorded = readFileSync(audit, "utf8").includes('"change.verified"');
      if (id === CHANGE) heard.push({ run, recorded });
    });
    try {
      // A task's verification the watcher sees, and that ends before its next look.
      const task = { task: "T2", command: "true", output: [], pid: process.pid };
      await writeRun(session.git, CHANGE, { ...task, startedAt: NOW.toISOString() });
      await vi.advanceTimersByTimeAsync(500);
      await until(() => heard.some(({ run }) => run?.task === "T2"));
      await clearRun(session.git, CHANGE);
      // The full verification starts and ends between two looks.
      await runs.start(CHANGE);
      await until(() => heard.some(({ run }) => run === undefined));
      // The watcher looks again: the task it saw is long over, and so is the change's run.
      await vi.advanceTimersByTimeAsync(500);
      await wait(300);
      expect(heard.filter(({ run }) => run === undefined)).toEqual([
        { run: undefined, recorded: true },
      ]);
    } finally {
      runs.close();
    }
  });
});
