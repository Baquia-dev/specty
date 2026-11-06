// SPDX-License-Identifier: Apache-2.0
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  cli,
  git,
  inWorktree,
  NOW,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** The rescue ref the clean-up makes for the folder named `name` at `NOW`, in UTC. */
const rescueRef = (name: string) =>
  `refs/specty/rescue/${name}/${NOW.toISOString().replace(/\D/g, "").slice(0, 14)}`;

const rescueRefs = (root: string) => git(root, "for-each-ref", "refs/specty/rescue/");
const listed = (root: string) => git(root, "worktree", "list", "--porcelain");

/** A repository whose change, approved in its own folder, lost that folder. */
async function lostChange() {
  const made = await inWorktree();
  await writeFiles(made.folder, { [SPEC_PATH]: SPEC });
  expect((await cli(made.folder, ["propose"])).code).toBe(0);
  const approved = await cli(made.folder, ["approve"], {
    terminal: person({ choose: ["confirm"] }),
  });
  expect(approved.code).toBe(0);
  await rm(made.folder, { recursive: true, force: true });
  return made;
}

describe("the records of worktrees whose folder is gone", () => {
  it("AC4: go with `specty prune`, but not locked ones, and the output says how many", async () => {
    const root = await tempRepo(APP);
    const gone = join(root, ".worktrees", "gone");
    const held = join(root, ".worktrees", "held");
    git(root, "worktree", "add", "-q", "-b", "gone", gone);
    git(root, "worktree", "add", "-q", "-b", "held", held);
    git(root, "worktree", "lock", held);
    await rm(gone, { recursive: true, force: true });
    await rm(held, { recursive: true, force: true });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(
      "REGISTROS DE WORKTREES OLVIDADOS:\n  Registros de git de worktrees cuya carpeta ya no existía: 1.",
    );
    expect(listed(root)).not.toContain(gone);
    expect(listed(root)).toContain(held);
  });

  it("AC4: go without hiding an open change that lost its folder, which `specty restore` still brings back", async () => {
    const { root, folder } = await lostChange();
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain("Registros de git de worktrees cuya carpeta ya no existía: 1.");
    expect(listed(root)).not.toContain(folder);
    expect((await cli(root, ["next"])).out).toContain(
      `CAMBIOS SIN CARPETA:\n  ${CHANGE} · implementing — Saludo personalizado`,
    );
    expect((await cli(root, ["restore", CHANGE])).code).toBe(0);
    expect(await exists(join(folder, SPEC_PATH))).toBe(true);
    expect(git(folder, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`specty/${CHANGE}`);
  });
});

describe("a ghost folder", () => {
  it("AC6: goes, after what git does not ignore of it goes to a rescue ref with no parent", async () => {
    const root = await tempRepo({ ...APP, ".gitignore": "node_modules/\n" });
    const ghost = join(root, ".worktrees", "viejo");
    await writeFiles(ghost, {
      "src/app.ts": "export const greet = () => 'perdido';\n",
      "node_modules/m/index.js": "module.exports = 1;\n",
    });
    const pruned = await cli(root, ["prune"]);
    const ref = rescueRef("viejo");
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(`CARPETAS FANTASMA BORRADAS:\n  ${ghost}\n`);
    expect(pruned.out).toContain(
      `GUARDADO EN REFS DE RESCATE:\n  ${ghost}: lo que tenía sin commit quedó en ${ref}; míralo con \`git show ${ref}\` y recupéralo con \`git worktree add <carpeta> ${ref}\`.`,
    );
    expect(await exists(ghost)).toBe(false);
    expect(git(root, "ls-tree", "-r", "--name-only", ref)).toBe("src/app.ts");
    expect(git(root, "show", `${ref}:src/app.ts`)).toBe("export const greet = () => 'perdido';");
    // A commit with no parent: its line lists only itself.
    expect(git(root, "rev-list", "--parents", "-n", "1", ref).split(" ")).toHaveLength(1);
  });

  it("AC6: goes with no rescue ref when it has nothing git keeps, and the sibling folder goes once empty", async () => {
    const root = await tempRepo(APP);
    const sibling = `${root}.worktrees`;
    const ghost = join(sibling, "antiguo");
    await mkdir(join(ghost, "src", "vacia"), { recursive: true });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(`CARPETAS FANTASMA BORRADAS:\n  ${ghost}`);
    expect(pruned.out).not.toContain("GUARDADO EN REFS DE RESCATE");
    expect(await exists(sibling)).toBe(false);
    expect(rescueRefs(root)).toBe("");
  });

  it("AC6: says how much its rescue weighs from 10 MB on", async () => {
    const root = await tempRepo(APP);
    const ghost = join(root, ".worktrees", "pesado");
    await writeFiles(ghost, { "datos.txt": "x".repeat(11 * 1024 * 1024) });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain(
      `recupéralo con \`git worktree add <carpeta> ${rescueRef("pesado")}\`. Pesa 11 MB.`,
    );
    expect(await exists(ghost)).toBe(false);
  });

  it("AC6: is left untouched when it is named after an open change that lost its folder", async () => {
    const { root, folder } = await lostChange();
    // Something wrote in the change's place, with no git: `specty restore` deals with it.
    await writeFiles(folder, { "notas.txt": "mías\n" });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).not.toContain("CARPETAS FANTASMA BORRADAS");
    expect(await read(folder, "notas.txt")).toBe("mías\n");
    expect(rescueRefs(root)).toBe("");
  });

  it("AC6: is left untouched when it holds a git repository of its own", async () => {
    const root = await tempRepo(APP);
    const other = join(root, ".worktrees", "otro");
    await writeFiles(other, { "LEEME.txt": "otro\n" });
    git(other, "init", "-q");
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).not.toContain("CARPETAS FANTASMA BORRADAS");
    expect(await read(other, "LEEME.txt")).toBe("otro\n");
  });
});

describe("a folder of `.specty/changes/` with no file", () => {
  it("AC7: goes, in the main folder and in a change's, and the folders with files stay", async () => {
    const { root, folder } = await inWorktree();
    const main = join(root, ".specty", "changes", "20261031-vacia");
    const inChange = join(folder, ".specty", "changes", "20261031-otra");
    await mkdir(join(main, "revisions"), { recursive: true });
    await mkdir(inChange, { recursive: true });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain("CARPETAS VACÍAS BORRADAS:");
    expect(pruned.out).toContain(`  ${main}`);
    expect(pruned.out).toContain(`  ${inChange}`);
    expect(await exists(main)).toBe(false);
    expect(await exists(inChange)).toBe(false);
    expect(await exists(join(folder, `.specty/changes/${CHANGE}/spec.md`))).toBe(true);
  });
});
