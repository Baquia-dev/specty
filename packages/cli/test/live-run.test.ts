// SPDX-License-Identifier: Apache-2.0
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { runLive } from "../src/flow/live-run";
import { writeText } from "../src/io/files";
import { readRuns } from "../src/store/runs";
import { sessionAt } from "./server/support";
import { AGENT, APP, CONFIG, tempRepo } from "./support";

/** Waits for `check` to hold, up to 20 s of real time. */
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 50));
  }
}

/** A session whose `config.yaml` sets `internal.server` to `server`. */
async function withServer(server: string) {
  const config = `${CONFIG()}internal:\n  server:\n    ${server}\n`;
  return sessionAt(await tempRepo({ ...APP, ".specty/config.yaml": config }), AGENT);
}

/** A command that prints the lines 1 to `count` and then waits 2 s. */
const printing = (count: number) =>
  `node -e "for (let i = 1; i <= ${count}; i++) console.log(i); setTimeout(() => {}, 2000)"`;

/** The lines `from` to `to`, each its number. */
const numbers = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => String(from + index));

describe("a task's verification, live", () => {
  it("is in its file while it runs, and gone once it ends (AC1)", async () => {
    const session = await sessionAt(await tempRepo(APP), AGENT);
    const running = runLive(session, "20261024-saludo", "T1", "echo uno && sleep 2 && echo dos");
    // While it sleeps, the file holds its first line.
    let live: Awaited<ReturnType<typeof readRuns>> = new Map();
    await until(async () => {
      live = await readRuns(session.git);
      return live.get("20261024-saludo")?.output.includes("uno") === true;
    });
    expect(live.get("20261024-saludo")).toMatchObject({
      task: "T1",
      command: "echo uno && sleep 2 && echo dos",
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

  it("AC3: keeps in its file only the last internal.server.runLines lines", async () => {
    const session = await withServer("runLines: 100");
    const running = runLive(session, "20261024-saludo", "T1", printing(300));
    let output: readonly string[] = [];
    await until(async () => {
      output = (await readRuns(session.git)).get("20261024-saludo")?.output ?? [];
      return output.includes("300");
    });
    expect(output).toEqual(numbers(201, 300));
    expect((await running).code).toBe(0);
  });

  it("AC3: keeps the last 1000 lines without the key", async () => {
    const session = await sessionAt(await tempRepo(APP), AGENT);
    const running = runLive(session, "20261024-saludo", "T1", printing(1500));
    let output: readonly string[] = [];
    await until(async () => {
      output = (await readRuns(session.git)).get("20261024-saludo")?.output ?? [];
      return output.includes("1500");
    });
    expect(output).toEqual(numbers(501, 1500));
    expect((await running).code).toBe(0);
  });

  it("AC4: writes its file again at most every internal.server.runEveryMs", async () => {
    const session = await withServer("runEveryMs: 10000");
    const running = runLive(session, "20261024-saludo", "T1", "echo uno && sleep 3 && echo dos");
    await until(async () => (await readRuns(session.git)).has("20261024-saludo"));
    // «uno» comes at once, but the file waits 10 s to be written again.
    await new Promise((done) => setTimeout(done, 1500));
    expect((await readRuns(session.git)).get("20261024-saludo")?.output).toEqual([]);
    expect((await running).code).toBe(0);
  });
});
