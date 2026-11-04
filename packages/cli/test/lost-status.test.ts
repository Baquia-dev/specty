// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, git, inWorktree, person, SPEC, SPEC_PATH, writeFiles } from "./support";

/** A repository whose change is approved in its own folder, so its state is on its branch. */
async function approvedInWorktree() {
  const made = await inWorktree();
  await writeFiles(made.folder, { [SPEC_PATH]: SPEC });
  expect((await cli(made.folder, ["propose"])).code).toBe(0);
  const approved = await cli(made.folder, ["approve"], {
    terminal: person({ choose: ["confirm"] }),
  });
  expect(approved.code).toBe(0);
  return made;
}

/** The open changes as `specty --json status` gives them from `cwd`. */
const changesFrom = async (cwd: string) =>
  JSON.parse((await cli(cwd, ["--json", "status"])).out).changes;

const LOST_LINE = `${CHANGE} · standard · implementing · espera al agente — Saludo personalizado · sin carpeta: se recupera desde su rama con \`specty restore ${CHANGE}\``;

describe("an open change whose folder is gone", () => {
  it("AC1: `status` lists it without a folder, with the command that brings it back", async () => {
    const { root, folder } = await approvedInWorktree();
    await rm(folder, { recursive: true, force: true });
    expect((await cli(root, ["status"])).out).toContain(LOST_LINE);
    const [change] = await changesFrom(root);
    expect(change).toMatchObject({ id: CHANGE, phase: "implementing", lost: true });
    expect(change).not.toHaveProperty("folder");
  });

  it("AC1: also once git no longer lists its folder", async () => {
    const { root, folder } = await approvedInWorktree();
    await rm(folder, { recursive: true, force: true });
    git(root, "worktree", "prune");
    expect((await cli(root, ["status"])).out).toContain(LOST_LINE);
    expect(await changesFrom(root)).toMatchObject([{ id: CHANGE, lost: true }]);
  });

  it("AC1: is not marked while its folder is there", async () => {
    const { root } = await approvedInWorktree();
    const text = (await cli(root, ["status"])).out;
    expect(text).toContain(`${CHANGE} · standard · implementing`);
    expect(text).not.toContain("sin carpeta");
    const [change] = await changesFrom(root);
    expect(change).not.toHaveProperty("lost");
  });
});
