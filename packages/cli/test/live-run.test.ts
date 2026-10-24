// SPDX-License-Identifier: Apache-2.0
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { runLive } from "../src/flow/live-run";
import { writeText } from "../src/io/files";
import { readRuns } from "../src/store/runs";
import { sessionAt } from "./server/support";
import { AGENT, APP, tempRepo } from "./support";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe("a task's verification, live", () => {
  it("is in its file while it runs, and gone once it ends (AC1)", async () => {
    const session = await sessionAt(await tempRepo(APP), AGENT);
    const running = runLive(session, "20261024-saludo", "T1", "echo uno && sleep 1 && echo dos");
    await wait(600);
    const live = (await readRuns(session.git)).get("20261024-saludo");
    expect(live).toMatchObject({
      task: "T1",
      command: "echo uno && sleep 1 && echo dos",
      startedAt: expect.any(String),
      output: ["uno"],
      pid: process.pid,
    });
    const result = await running;
    expect([result.code, result.stdout]).toEqual([0, "uno\ndos\n"]);
    expect((await readRuns(session.git)).size).toBe(0);
  });

  it("is removed when it fails too, and unreadable files are left out (AC1)", async () => {
    const session = await sessionAt(await tempRepo(APP), AGENT);
    const result = await runLive(session, "20261024-saludo", "T2", "echo mal && exit 2");
    expect(result.code).toBe(2);
    const folder = dirname(await session.git.gitPath("common/specty/runs/x.json"));
    await writeText(`${folder}/roto.json`, "{ no es json");
    await writeText(`${folder}/otro.json`, JSON.stringify({ task: "T1" }));
    expect((await readRuns(session.git)).size).toBe(0);
  });
});
