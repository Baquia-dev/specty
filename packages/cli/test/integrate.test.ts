// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  APP as FILES,
  folderOf,
  git,
  inWorktree,
  person,
  quickInWorktree,
  read,
  SPEC_PATH,
  stateIn,
  tempRepo,
  toAcceptance,
  toClosing,
  tryGit,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;

/** A full verification that counts its runs in the repository's `.git/runs`, from any worktree. */
const COUNTED = `node -e "require('fs').appendFileSync(process.argv[1] + '/runs', 'x')" "$(git rev-parse --git-common-dir)"`;
const COUNTING = {
  ...FILES,
  ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(COUNTED)}\n`,
};
const runs = async (root: string) => (await read(root, ".git/runs")).length;
const MERGED = /Antes, main se incorporó a la rama del cambio \(merge [0-9a-f]{7}\)/;

/** Main moves on in `root` with a file the change does not touch. */
async function mainMoves(root: string): Promise<void> {
  await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "otro trabajo en main");
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

  it("merges a main that moved on acceptance, and the full verification runs only there", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    await mainMoves(root);
    const terminal = person();
    const accepted = await cli(folder, ["accept"], { terminal });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toMatch(MERGED);
    expect(terminal.notes.join("\n")).toContain(
      "ya pasó con este mismo código en una verificación anterior: no se repite.",
    );
    expect(await runs(root)).toBe(1);
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
    expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).not.toMatch(MERGED);
    expect(await runs(root)).toBe(1);
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

  it("leaves a merge with conflicts in the change's folder for the agent", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    const tip = git(folder, "rev-parse", "HEAD");
    await writeFiles(root, { "src/app.ts": "main\n" });
    git(root, "commit", "-q", "-am", "main cambia el saludo");
    const main = git(root, "rev-parse", "main");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain(`SPECTY · ${CHANGE} · closing`);
    expect(closed.out).toContain(
      "No se cerró: el merge queda en esta carpeta para que lo resuelva el agente.\nmain choca con este cambio.",
    );
    expect(closed.out).toContain("CONFLICTOS:\n  src/app.ts");
    const ask =
      "SIGUIENTE: dile a tu agente «continúa» (ejecutará `specty next`); cuando termine, vuelve a ejecutar `specty close`.";
    expect(closed.out).toContain(ask);
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).toBe(0);
    expect(await read(folder, "src/app.ts")).toContain("<<<<<<<");
    expect(git(folder, "rev-parse", "HEAD")).toBe(tip);
    expect(git(root, "rev-parse", "main")).toBe(main);
    expect(await stateIn(folder)).toMatchObject({
      phase: "closing",
      integration: {
        target: "main",
        commit: main,
        reason: "conflicts",
        conflicts: ["src/app.ts"],
        paths: ["src/app.ts"],
      },
    });
    // While the agent resolves it, closing waits (AC7).
    const waiting = await cli(folder, ["close"], { terminal: person() });
    expect(waiting.code).toBe(2);
    expect(waiting.out).toContain(
      "El agente aún resuelve la incorporación de main en esta carpeta.",
    );
    expect(waiting.out).toContain(ask);
    // A merge someone aborted is forgotten and the incorporation starts over.
    git(folder, "merge", "--abort");
    const again = await cli(folder, ["close"], { terminal: person() });
    expect(again.out).toContain("CONFLICTOS:\n  src/app.ts");
    expect(await read(folder, `.specty/changes/${CHANGE}/audit.jsonl`)).toContain(
      '"event":"integration.abandoned"',
    );
  });

  it("leaves a merge whose verification fails for the agent", async () => {
    const config = `${CONFIG()}  full: "echo roto && exit 1"\n`;
    const { root, folder } = await inWorktree({ ...FILES, ".specty/config.yaml": config });
    await toClosing(folder);
    await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "otro trabajo en main");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain("Con main incorporado, `echo roto && exit 1` falla.");
    expect(closed.out).toContain("SALIDA DE LA VERIFICACIÓN:\n  roto");
    expect(closed.out).toContain("SIGUIENTE: dile a tu agente «continúa»");
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).toBe(0);
    expect(await exists(join(folder, "src/other.ts"))).toBe(true);
    expect(await stateIn(folder)).toMatchObject({
      integration: { reason: "verify", conflicts: [], paths: ["src/app.ts", "src/other.ts"] },
    });
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
    const quick = (title: string, slug: string, text: string) =>
      quickInWorktree(root, title, slug, text);
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
    expect(refused.out).toContain(
      "No se aceptó: el merge queda en esta carpeta para que lo resuelva el agente.",
    );
    expect(refused.out).toContain("CONFLICTOS:\n  src/button.ts");
    expect(refused.out).toContain("cuando termine, vuelve a ejecutar `specty accept`.");
    expect(await stateIn(second.folder, second.id)).toMatchObject({
      phase: "acceptance",
      integration: { reason: "conflicts", conflicts: ["src/button.ts"] },
    });
    const waiting = await cli(second.folder, ["accept"], { terminal: person() });
    expect(waiting.out).toContain("El agente aún resuelve la incorporación de main");
  });

  it("verifies a quick change once when main moved before its acceptance", async () => {
    const root = await tempRepo({ ...COUNTING, "src/button.ts": "Sing in\n" });
    const { folder } = await quickInWorktree(root, "Corregir botón", "corregir-boton", "Sign in\n");
    await mainMoves(root);
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toMatch(MERGED);
    expect(await runs(root)).toBe(1);
    expect(await read(root, "src/button.ts")).toBe("Sign in\n");
    expect(await read(root, "src/other.ts")).toBe("export const other = 1;\n");
  });

  it("incorporates into git.target, and into nothing when that branch is missing", async () => {
    const config =
      'version: 1\nlanguage: es\ngit:\n  worktrees: false\n  target: develop\nverify:\n  default: "true"\n';
    const toDevelop = async () => {
      const root = await tempRepo({ ...FILES, ".specty/config.yaml": config });
      git(root, "branch", "develop");
      expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
      const folder = folderOf(root);
      await toClosing(folder);
      return { root, folder, main: git(root, "rev-parse", "main") };
    };
    const kept = await toDevelop();
    const closed = await cli(kept.folder, ["close"], { terminal: person() });
    expect(closed.out).toContain("Incorporado a develop.");
    expect(git(kept.root, "rev-parse", "develop")).toBe(git(kept.root, "rev-parse", BRANCH));
    expect(git(kept.root, "rev-parse", "main")).toBe(kept.main);
    expect(await exists(kept.folder)).toBe(false);

    const gone = await toDevelop();
    git(gone.root, "branch", "-D", "develop");
    const alone = await cli(gone.folder, ["close"], { terminal: person() });
    expect(alone.out).toContain(`SIGUIENTE: fusiona la rama ${BRANCH} (o abre un PR)`);
    expect(git(gone.root, "rev-parse", "main")).toBe(gone.main);
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
