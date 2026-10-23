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
  tryGit,
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

  it("leaves everything as it was when main conflicts with the change (AC3)", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    const tip = git(folder, "rev-parse", "HEAD");
    await writeFiles(root, { "src/app.ts": "main\n" });
    git(root, "commit", "-q", "-am", "main cambia el saludo");
    const main = git(root, "rev-parse", "main");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain(`SPECTY · ${CHANGE} · closing`);
    expect(closed.out).toContain("No se cerró y nada cambió.\nmain choca con este cambio.");
    expect(closed.out).toContain("CONFLICTOS:\n  src/app.ts");
    expect(closed.out).toContain(
      "SIGUIENTE: incorpora main a mano en esta carpeta (`git merge main`, resuelve y haz el commit) y vuelve a ejecutar `specty close`.",
    );
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).not.toBe(0);
    expect(git(folder, "rev-parse", "HEAD")).toBe(tip);
    expect(git(root, "rev-parse", "main")).toBe(main);
    expect(await read(folder, "src/app.ts")).toBe("2\n");
    expect((await cli(folder, ["next"])).out).toContain(`SPECTY · ${CHANGE} · closing`);
  });

  it("leaves everything as it was when the verification fails after merging main (AC4)", async () => {
    const config = `${CONFIG()}  full: "echo roto && exit 1"\n`;
    const { root, folder } = await inWorktree({ ...FILES, ".specty/config.yaml": config });
    await toClosing(folder);
    const tip = git(folder, "rev-parse", "HEAD");
    await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "otro trabajo en main");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain("Con main incorporado, `echo roto && exit 1` falla.");
    expect(closed.out).toContain("SALIDA DE LA VERIFICACIÓN:\n  roto");
    expect(closed.out).toContain("SIGUIENTE: incorpora main a mano en esta carpeta");
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).not.toBe(0);
    expect(git(folder, "rev-parse", "HEAD")).toBe(tip);
    expect(await exists(join(folder, "src/other.ts"))).toBe(false);
  });

  it("refuses before touching anything when main's folder has uncommitted changes (AC6)", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    await writeFiles(root, { "src/app.ts": "a medias\n" });
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain(`main está en ${root}, que tiene cambios sin commit`);
    expect(closed.out).toContain("SIN COMMIT:\n  src/app.ts");
    expect(closed.out).toContain(
      `SIGUIENTE: guarda o descarta esos cambios en ${root} y vuelve a ejecutar \`specty close\`.`,
    );
    expect((await cli(folder, ["next"])).out).toContain(`SPECTY · ${CHANGE} · closing`);
    expect(await read(root, "src/app.ts")).toBe("a medias\n");
  });

  it("retries only the incorporation of a closed change that did not reach main (AC7)", async () => {
    const root = await tempRepo(FILES);
    git(root, "branch", "-m", "main", "trunk");
    await cli(root, ["new", "Saludo personalizado"]);
    await toClosing(root);
    await cli(root, ["close"], { terminal: person() });
    // Now there is a main branch, and the closed change is not in it.
    git(root, "branch", "-m", "trunk", "main");
    const retried = await cli(root, ["close"], { terminal: person() });
    expect(retried.code).toBe(0);
    expect(retried.out).toContain("El cambio ya estaba cerrado y archivado.");
    expect(retried.out).toContain("Incorporado a main.");
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    const closings = git(root, "log", "--format=%s", "main").split("\n");
    expect(closings.filter((subject) => subject.startsWith("docs(spec): cerrar"))).toHaveLength(1);
    git(root, "switch", "-q", BRANCH);
    const again = await cli(root, ["close"], { terminal: person() });
    expect(again.out).toContain("No hay nada pendiente de `close` en la fase done.");
  });

  it("incorporates a quick change on acceptance, and keeps it in acceptance on a conflict (AC8)", async () => {
    const root = await tempRepo({ ...FILES, "src/button.ts": "Sing in\n" });
    /** A quick change in its own worktree that writes `text` to the button, done and in acceptance. */
    const quick = async (title: string, slug: string, text: string) => {
      expect((await cli(root, ["new", "--worktree", "--kind", "quick", title])).code).toBe(0);
      const id = `${CHANGE.slice(0, 8)}-${slug}`;
      const folder = join(dirname(root), `${basename(root)}.worktrees`, id);
      await writeFiles(folder, {
        [`.specty/changes/${id}/spec.md`]: `---\nkind: quick\n---\n\n# ${title}\n\n## Objetivo\n\nDice «Sing in».\n\n## Archivos\n\n- modificar src/button.ts — texto\n\n## Tareas\n\n- [ ] T1: Corregir texto\n  - files: src/button.ts\n  - type: fix\n`,
      });
      await cli(folder, ["propose"]);
      await cli(folder, ["approve"], { terminal: person() });
      await cli(folder, ["next"]);
      await writeFiles(folder, { "src/button.ts": text });
      await cli(folder, ["task", "done", "T1", "--summary", "Texto corregido"]);
      return { id, folder };
    };
    const first = await quick("Corregir botón", "corregir-boton", "Sign in\n");
    const accepted = await cli(first.folder, ["accept"], { terminal: person() });
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toContain("Incorporado a main.");
    expect(await read(root, "src/button.ts")).toBe("Sign in\n");
    expect(await exists(first.folder)).toBe(false);

    const second = await quick("Otro botón", "otro-boton", "Log in\n");
    await writeFiles(root, { "src/button.ts": "Sign up\n" });
    git(root, "commit", "-q", "-am", "main cambia el botón");
    const refused = await cli(second.folder, ["accept"], { terminal: person() });
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("No se aceptó y nada cambió.");
    expect(refused.out).toContain("CONFLICTOS:\n  src/button.ts");
    expect(refused.out).toContain("y vuelve a ejecutar `specty accept`.");
    expect((await cli(second.folder, ["next"])).out).toContain(
      `SPECTY · ${second.id} · acceptance`,
    );
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
