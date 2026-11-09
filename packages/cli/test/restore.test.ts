// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  git,
  inWorktree,
  person,
  read,
  SPEC,
  SPEC_PATH,
  worktreeList,
  writeFiles,
} from "./support";

/** Specty's configuration with a setup command that `new` and `restore` run in the folder. */
const CONFIG_WITH_SETUP =
  'version: 1\nlanguage: es\ngit:\n  setup: "true"\nverify:\n  default: "true"\n';

/** A repository whose change is approved in its own folder, so its state is on its branch. */
async function approvedInWorktree() {
  const made = await inWorktree({ ...APP, ".specty/config.yaml": CONFIG_WITH_SETUP });
  await writeFiles(made.folder, { [SPEC_PATH]: SPEC });
  expect((await cli(made.folder, ["propose"])).code).toBe(0);
  const approved = await cli(made.folder, ["approve"], {
    terminal: person({ choose: ["confirm"] }),
  });
  expect(approved.code).toBe(0);
  return made;
}

/** The same repository once the change's folder is gone. */
async function lostFolder() {
  const made = await approvedInWorktree();
  await rm(made.folder, { recursive: true, force: true });
  return made;
}

const HOOKS = ".claude/settings.local.json";

describe("`specty restore` of a change without its folder", () => {
  it("AC2: brings the folder back from its branch, with the agent's hooks and prepared", async () => {
    const { root, folder } = await lostFolder();
    await writeFiles(root, { [HOOKS]: '{"hooks":{}}\n' });
    const restored = await cli(root, ["restore", CHANGE]);
    expect(restored.code).toBe(0);
    expect(restored.out).toContain(
      `Carpeta recuperada: ${CHANGE} (rama specty/${CHANGE}) en ${folder}.`,
    );
    expect(restored.out).toContain(
      "Lo que no estaba confirmado en la rama cuando se perdió la carpeta no vuelve.",
    );
    expect(restored.out).toContain("Carpeta preparada con `true`.");
    expect(restored.out).toContain(`HOOKS DEL AGENTE COPIADOS:\n  ${HOOKS}`);
    expect(restored.out).toContain(`SIGUIENTE: continúa en ${folder}:`);
    expect(await read(folder, SPEC_PATH)).toContain("# Saludo personalizado");
    expect(await read(folder, HOOKS)).toBe('{"hooks":{}}\n');
    expect(git(folder, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`specty/${CHANGE}`);
    const status = (await cli(root, ["status"])).out;
    expect(status).not.toContain("sin carpeta");
    expect(status).toContain(`en .worktrees/${CHANGE}`);
  });

  it("AC2: works once git no longer lists the folder, and the change carries on there", async () => {
    const { root, folder } = await lostFolder();
    git(root, "worktree", "prune");
    const restored = await cli(root, ["restore", CHANGE]);
    expect(restored.code).toBe(0);
    expect(restored.out).toContain(`Carpeta recuperada: ${CHANGE}`);
    expect((await cli(folder, ["next"])).out).toContain(`SPECTY · ${CHANGE} · implementing`);
  });

  it("AC2: leaves git one worktree for the branch, with no dead record behind", async () => {
    const { root, folder } = await lostFolder();
    expect((await cli(root, ["restore", CHANGE])).code).toBe(0);
    const listed = worktreeList(root);
    expect(listed.split(`branch refs/heads/specty/${CHANGE}`)).toHaveLength(2);
    expect(listed).not.toContain("prunable");
    expect(listed).toContain(`worktree ${folder}`);
  });
});

describe("a folder in the change's place", () => {
  it("AC3: one git recognizes again after repairing it stays as it was", async () => {
    const { root, folder } = await approvedInWorktree();
    await writeFiles(folder, { "notas.txt": "sin confirmar\n" });
    // Git's record of the folder points elsewhere, as when the folder was moved by hand.
    await writeFile(join(root, ".git", "worktrees", CHANGE, "gitdir"), "/en/otra/parte/.git\n");
    expect((await cli(root, ["status"])).out).toContain("sin carpeta");
    const restored = await cli(root, ["restore", CHANGE]);
    expect(restored.code).toBe(0);
    expect(restored.out).toContain(
      `Git volvió a reconocer ${folder} como la carpeta del cambio ${CHANGE} (rama specty/${CHANGE}): queda como estaba.`,
    );
    expect(await read(folder, "notas.txt")).toBe("sin confirmar\n");
    expect((await cli(root, ["status"])).out).not.toContain("sin carpeta");
  });

  it("AC3: one git does not recognize is left untouched, and the command fails naming it", async () => {
    const { root, folder } = await lostFolder();
    git(root, "worktree", "prune");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "notas.txt"), "mías\n");
    const refused = await cli(root, ["restore", CHANGE]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      `En ${folder} hay una carpeta que git no reconoce como la del cambio ${CHANGE}, y \`git worktree repair\` no la recuperó: Specty no la toca.`,
    );
    expect(refused.out).toContain(`SIGUIENTE: pídele a la persona que aparte ${folder}`);
    expect(await readdir(folder)).toEqual(["notas.txt"]);
    expect((await cli(root, ["status"])).out).toContain("sin carpeta");
  });
});

describe("`specty restore` with nothing to restore", () => {
  it("AC4: refuses a change that has its folder, and touches nothing", async () => {
    const { root, folder } = await approvedInWorktree();
    const before = git(root, "worktree", "list", "--porcelain");
    const refused = await cli(root, ["restore", CHANGE]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      `El cambio ${CHANGE} tiene su carpeta en ${folder}: no hay nada que recuperar.`,
    );
    expect(git(root, "worktree", "list", "--porcelain")).toBe(before);
  });

  it("AC4: refuses an id with no open change", async () => {
    const { root } = await approvedInWorktree();
    const refused = await cli(root, ["restore", "20990101-no-existe"]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      "No hay un cambio abierto sin carpeta con el id 20990101-no-existe.",
    );
  });
});
