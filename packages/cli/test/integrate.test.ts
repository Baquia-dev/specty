// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const FILES = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  ".specty/config.yaml": CONFIG(),
};
const BRANCH = `specty/${CHANGE}`;

/** Where `new --worktree` puts the change of `root`. */
const folderOf = (root: string) => join(dirname(root), `${basename(root)}.worktrees`, CHANGE);

/** A repository whose change lives in a worktree of its own. */
async function inWorktree(files: Readonly<Record<string, string>> = FILES) {
  const root = await tempRepo(files);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** Takes the change in `folder` from its spec to a closing waiting for the person. */
async function toClosing(folder: string): Promise<void> {
  await writeFiles(folder, { [SPEC_PATH]: SPEC });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(folder, ["next"]);
  await writeFiles(folder, { "src/app.ts": "1\n" });
  await cli(folder, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(folder, { "src/app.ts": "2\n" });
  await cli(folder, ["task", "done", "T2", "--summary", "Dos"]);
  await cli(folder, ["accept"], { terminal: person() });
  const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
  expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
}

describe("closing incorporates the change into the main branch", () => {
  it("fast-forwards main where it is checked out and removes the change's worktree (AC1, AC5)", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Cambio cerrado y archivado");
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).toContain(`La carpeta ${folder} se eliminó y la rama ${BRANCH} queda`);
    expect(closed.out).not.toContain("fusiona la rama");
    expect(closed.out).toContain('SIGUIENTE: para otro cambio, `specty new "<título>"`.');
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(await read(root, "src/app.ts")).toBe("2\n");
    expect(await exists(join(root, ARCHIVE, CHANGE, "spec.md"))).toBe(true);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(await exists(folder)).toBe(false);
  });

  it("first merges a main that moved, verified, and then fast-forwards it (AC2)", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "otro trabajo en main");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toMatch(
      /Antes, main se incorporó a la rama del cambio \(merge [0-9a-f]{7}\) y `true` pasó\./,
    );
    const merge = git(root, "rev-list", "--merges", "-1", BRANCH);
    expect(git(root, "log", "-1", "--format=%P", merge).split(" ")).toHaveLength(2);
    expect(git(root, "log", "-1", "--format=%B", merge)).toContain(`Specty-Change: ${CHANGE}`);
    // The archive commit comes after the merge, and main moved to it.
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(await read(root, "src/app.ts")).toBe("2\n");
    expect(await read(root, "src/other.ts")).toBe("export const other = 1;\n");
  });

  it("brings the main folder back to main when the change lived there (AC5)", async () => {
    const root = await tempRepo(FILES);
    await cli(root, ["new", "Saludo personalizado"]);
    await toClosing(root);
    const closed = await cli(root, ["close"], { terminal: person() });
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).toContain("Esta carpeta vuelve a main.");
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("closes as before in team mode and without a main branch (AC9)", async () => {
    const team = await inWorktree({ ...FILES, ".specty/config.yaml": `${CONFIG()}mode: team\n` });
    await toClosing(team.folder);
    const main = git(team.root, "rev-parse", "main");
    const closed = await cli(team.folder, ["close"], { terminal: person() });
    expect(closed.out).toContain(`SIGUIENTE: fusiona la rama ${BRANCH} (o abre un PR)`);
    expect(git(team.root, "rev-parse", "main")).toBe(main);
    expect(await exists(team.folder)).toBe(true);

    const root = await tempRepo(FILES);
    git(root, "branch", "-m", "main", "trunk");
    await cli(root, ["new", "Saludo personalizado"]);
    await toClosing(root);
    const alone = await cli(root, ["close"], { terminal: person() });
    expect(alone.out).toContain(`SIGUIENTE: fusiona la rama ${BRANCH} (o abre un PR)`);
    expect(git(root, "branch", "--show-current")).toBe(BRANCH);
  });
});
