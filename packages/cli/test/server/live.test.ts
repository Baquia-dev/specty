// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { clearRun, readRuns, writeRun } from "../../src/store/runs";
import { AGENT, CHANGE, NOW } from "../support";
import { call, listen, path, serving, sessionAt } from "./support";

const RUN = {
  task: "T1",
  command: "pnpm test",
  startedAt: NOW.toISOString(),
  output: ["uno"],
  pid: process.pid,
};
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe("a task's verification in the local server", () => {
  it("reaches the UI as its file moves, and ends with it (AC2)", async () => {
    const { root, server, headers } = await serving();
    const events = listen(server.port, headers);
    try {
      await events.until(({ name }) => name === "changes");
      const { git } = await sessionAt(root, AGENT);
      await writeRun(git, CHANGE, RUN);
      await events.until(({ name, data }) => name === "run" && data.includes('"task":"T1"'));
      // A tab that opens now sees it from what it has so far.
      const going = JSON.parse((await call(server.port, path("run"), headers)).body);
      expect(going).toEqual({
        task: "T1",
        command: "pnpm test",
        startedAt: RUN.startedAt,
        output: ["uno"],
      });
      await writeRun(git, CHANGE, { ...RUN, output: ["uno", "dos"] });
      await events.until(({ data }) => data.includes('"output":["uno","dos"]'));
      await clearRun(git, CHANGE);
      await events.until(({ name, data }) => name === "run" && data.endsWith('"run":null}'));
      expect((await call(server.port, path("run"), headers)).body).toBe("null");
    } finally {
      events.close();
      await server.close();
    }
  });

  it("drops the file of a process that no longer exists (AC3)", async () => {
    const { root, server, headers } = await serving();
    try {
      const { git } = await sessionAt(root, AGENT);
      const gone = spawnSync("true").pid;
      await writeRun(git, CHANGE, { ...RUN, pid: gone });
      await wait(1200);
      expect((await call(server.port, path("run"), headers)).body).toBe("null");
      expect((await readRuns(git)).size).toBe(0);
    } finally {
      await server.close();
    }
  });
});
