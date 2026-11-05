// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/events";
import { changeRecord, openRecords } from "../../src/server/records";
import { AGENT, CHANGE, cli, folderOf, inWorktree, read, writeFiles } from "../support";
import { sessionAt } from "./support";

const CONFIG_PATH = ".specty/config.yaml";
const OTHER = `${CHANGE.slice(0, 8)}-otro-cambio`;

/**
 * SPEC's change in its worktree, whose configuration gains a key this CLI does not know, as a
 * newer Specty would write it, and another change in its own worktree, whose configuration reads.
 */
async function withNewerConfig() {
  const { root, folder } = await inWorktree();
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  const config = await read(folder, CONFIG_PATH);
  await writeFiles(folder, { [CONFIG_PATH]: `${config}futuro: true\n` });
  return { root, folder, other: folderOf(root, OTHER) };
}

describe("a change whose folder's configuration cannot be read", () => {
  it("AC1: comes in the open changes and by its id, with its folder and its configuration's issues", async () => {
    const { root, folder, other } = await withNewerConfig();
    const session = await sessionAt(root, AGENT);
    const records = await openRecords(session);
    const unread = records.find(({ state }) => state.id === CHANGE);
    expect(unread?.folder).toBe(folder);
    expect(unread?.state.phase).toBe("draft");
    expect(unread?.spec).toContain("# Saludo personalizado");
    expect(unread?.configIssues).toEqual(['Unrecognized key: "futuro"']);
    expect((await changeRecord(session, CHANGE))?.configIssues).toEqual([
      'Unrecognized key: "futuro"',
    ]);
    // The change whose configuration reads comes as before, without issues.
    const readable = records.find(({ state }) => state.id === OTHER);
    expect(readable?.folder).toBe(other);
    expect(readable).not.toHaveProperty("configIssues");
    expect(records.filter(({ state }) => state.id === CHANGE)).toHaveLength(1);
  });

  it("AC1: names the path of an unknown key inside a section", async () => {
    const { root, folder } = await withNewerConfig();
    const config = (await read(folder, CONFIG_PATH)).replace("futuro: true\n", "");
    await writeFiles(folder, {
      [CONFIG_PATH]: config.replace("verify:\n", "verify:\n  nueva: 1\n"),
    });
    const record = await changeRecord(await sessionAt(root, AGENT), CHANGE);
    expect(record?.configIssues).toEqual(['verify: Unrecognized key: "nueva"']);
  });

  it("AC2: its commands still refuse to run there, with the configuration's error", async () => {
    const { folder } = await withNewerConfig();
    const run = await cli(folder, ["next"]);
    expect(run.code).not.toBe(0);
    expect(`${run.out}\n${run.err}`).toContain('Unrecognized key: "futuro"');
  });

  it("AC3: the server's fingerprint moves when a worktree's configuration changes", async () => {
    const { root, folder } = await inWorktree();
    const session = await sessionAt(root, AGENT);
    const before = await fingerprint(session);
    expect(await fingerprint(session)).toBe(before);
    const config = await read(folder, CONFIG_PATH);
    await writeFiles(folder, { [CONFIG_PATH]: `${config}futuro: true\n` });
    expect(await fingerprint(session)).not.toBe(before);
  });
});
