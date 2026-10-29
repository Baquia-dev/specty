// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createGit } from "../src/io/git";
import { type LiveRun, readRuns } from "../src/store/runs";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

/** A full verification that prints a line and then takes two seconds: long enough to watch it. */
const FULL = "echo completo && sleep 2 && echo fin";

/** Waits for `check` to hold, up to 20 s of real time. */
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 50));
  }
}

/** A repository whose change waits for the person to accept it, with `FULL` as `verify.full`. */
async function inAcceptance() {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}  full: "${FULL}"\n` });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "1\n" });
  await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(root, { "src/app.ts": "2\n" });
  await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
  return root;
}

describe("specty accept's full verification, live", () => {
  it("AC1: is in the live file while it runs, with no task, and gone once it ends", async () => {
    const root = await inAcceptance();
    const git = createGit(root, testEnv());
    const accepting = cli(root, ["accept"], { terminal: person() });
    let live: LiveRun | undefined;
    await until(async () => {
      live = (await readRuns(git)).get(CHANGE);
      return live?.output.includes("completo") === true;
    });
    expect(live).toMatchObject({
      command: FULL,
      startedAt: expect.any(String),
      output: ["completo"],
    });
    // Without a task it is the full verification, as `specty ui` already reads a run of its own.
    expect(live?.task).toBeUndefined();
    expect((await accepting).code).toBe(0);
    expect((await readRuns(git)).has(CHANGE)).toBe(false);
  });
});
