// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  git,
  inWorktree,
  NOW,
  person,
  tempRepo,
  toClosing,
  writeFiles,
} from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const REMOVED = "CARPETAS DE CAMBIOS TERMINADOS, BORRADAS";

/**
 * A change closed (delegated mode) whose folder could not be removed: it was locked then. `close`
 * removes the folder of a merged change, so only one like this is left for the clean-up.
 */
async function leftover() {
  const { root, folder } = await inWorktree();
  await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  await toClosing(folder);
  await closeLocked(root, folder);
  return { root, folder };
}

/** Closes the change in `folder` while its worktree is locked, so the folder stays. */
async function closeLocked(root: string, folder: string): Promise<void> {
  git(root, "worktree", "lock", folder);
  expect((await cli(folder, ["close"])).out).toContain(`La carpeta ${folder} queda: `);
  git(root, "worktree", "unlock", folder);
}

describe("folders of finished changes", () => {
  it("go when a new change starts, but not the folder it runs in (AC1, AC3, AC4)", async () => {
    const { root, folder } = await leftover();
    const fromInside = await cli(folder, ["new", "--worktree", "Otro cambio"]);
    expect(fromInside.code).toBe(0);
    expect(fromInside.out).not.toContain(REMOVED);
    expect(await exists(folder)).toBe(true);
    const fromRoot = await cli(root, ["new", "--worktree", "Tercero"]);
    expect(fromRoot.out).toContain(`${REMOVED}:\n  ${folder}`);
    expect(await exists(folder)).toBe(false);
    // The open change's folder and the closed change's branch stay.
    expect(await exists(folderOf(root, OTHER))).toBe(true);
    expect(git(root, "branch", "--list", `specty/${CHANGE}`)).toContain(CHANGE);
    expect((await cli(root, ["new", "--worktree", "Cuarto"])).out).not.toContain(REMOVED);
  });

  it("stay while an agent session works in them, for a day", async () => {
    const { root, folder } = await leftover();
    // The guard's record of the session that closed the change from inside its folder.
    const bound = (at: Date) =>
      writeFiles(root, {
        ".git/common/specty/sessions/s1.json": JSON.stringify({ folder, at: at.toISOString() }),
      });
    await bound(NOW);
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain(`QUEDAN:\n  ${folder}: una sesión de agente trabaja en ella.`);
    expect((await cli(root, ["new", "--worktree", "Tercero"])).out).not.toContain(REMOVED);
    expect(await exists(folder)).toBe(true);
    // Nothing deletes the record when the session ends: a day later, it no longer counts.
    await bound(new Date(NOW.getTime() - 25 * 60 * 60 * 1000));
    const later = await cli(root, ["new", "--worktree", "Cuarto"]);
    expect(later.out).toContain(`${REMOVED}:\n  ${folder}`);
    expect(await exists(folder)).toBe(false);
  });
});

describe("specty prune", () => {
  it("removes finished folders and merged branches, and keeps the rest (AC2, AC3)", async () => {
    // The other changes start first: a new change would already clean up finished folders.
    const { root, folder } = await inWorktree();
    expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
    expect((await cli(root, ["new", "--worktree", "Tercero"])).code).toBe(0);
    const cancelled = folderOf(root, OTHER);
    const open = folderOf(root, CHANGE.replace("saludo-personalizado", "tercero"));
    // A cancelled change: its folder goes, its branch (not in main) stays.
    await cli(cancelled, ["cancel", "--reason", "Ya no"], { terminal: person() });
    // A closed change whose folder stayed: its folder goes, its branch (in main) too.
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await toClosing(folder);
    await closeLocked(root, folder);
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain("CARPETAS BORRADAS:");
    expect(pruned.out).toContain(`  ${folder}\n`);
    expect(pruned.out).toContain(`  ${cancelled}`);
    expect(pruned.out).toContain(`RAMAS BORRADAS:\n  specty/${CHANGE}`);
    expect(pruned.out).toContain(`QUEDAN:\n  specty/${OTHER}: no está en main.`);
    expect(await exists(folder)).toBe(false);
    expect(await exists(cancelled)).toBe(false);
    expect(await exists(open)).toBe(true);
    expect(git(root, "branch", "--list", `specty/${CHANGE}`)).toBe("");
    expect(git(root, "branch", "--list", `specty/${OTHER}`)).toContain(OTHER);
  });

  it("keeps a closed change that is not in its target yet, and says when nothing goes (AC3, AC4)", async () => {
    const { root, folder } = await inWorktree();
    const before = git(root, "rev-parse", "main");
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    await toClosing(folder);
    await closeLocked(root, folder);
    // main goes back: the closed change is no longer in it.
    git(root, "reset", "-q", "--hard", before);
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain(`QUEDAN:\n  ${folder}: ${CHANGE} aún no está en main.`);
    expect(await exists(folder)).toBe(true);
    const clean = await cli(await tempRepo(APP), ["prune"]);
    expect(clean.out).toContain("No había nada que limpiar.");
  });
});
