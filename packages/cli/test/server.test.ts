// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { changeRecords } from "../src/server/records";
import { openSession, type Session } from "../src/session";
import {
  AGENT,
  ARCHIVE,
  CHANGE,
  cli,
  DIST,
  folderOf,
  inWorktree,
  NOW,
  person,
  testEnv,
  toClosing,
  writeFiles,
} from "./support";

/** A session in `cwd`, as the commands open it. */
async function sessionAt(cwd: string): Promise<Session> {
  const opened = await openSession({
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error(`no Specty session in ${cwd}`);
  return opened.session;
}

const OTHER = `${CHANGE.slice(0, 8)}-otro-cambio`;

/** A repository with a closed change in main's archive and an open one in its own worktree. */
async function twoChanges() {
  const { root, folder } = await inWorktree();
  await toClosing(folder);
  expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, other: folderOf(root, OTHER) };
}

describe("the changes the server gives", () => {
  it("are the open change of each worktree and the archived ones, once each", async () => {
    const { root, other } = await twoChanges();
    const records = await changeRecords(await sessionAt(root));
    expect(records.map(({ state, folder }) => [state.id, state.phase, folder])).toEqual([
      [OTHER, "draft", other],
      [CHANGE, "done", root],
    ]);
    const [open, closed] = records;
    expect(open?.spec).toContain("# Otro cambio");
    expect(open?.phaseSince).toBe(NOW.toISOString());
    expect(closed?.approvedSpec).toContain("# Saludo personalizado");
    expect(closed?.audit?.at(-1)).toMatchObject({ event: "change.closed" });
    expect(closed?.phaseSince).toBe(closed?.audit?.at(-1)?.ts);
    // The same answer from the other worktree.
    const there = await changeRecords(await sessionAt(other));
    expect(there.map(({ state }) => state.id)).toEqual([OTHER, CHANGE]);
  });

  it("leave out an archived change whose state cannot be read", async () => {
    const { root } = await twoChanges();
    await writeFiles(root, {
      [`${ARCHIVE}/20260101-roto/spec.md`]: "# Roto\n",
      [`${ARCHIVE}/20260101-roto/state.json`]: "{}\n",
    });
    const records = await changeRecords(await sessionAt(root));
    expect(records.map(({ state }) => state.id)).toEqual([OTHER, CHANGE]);
  });
});
