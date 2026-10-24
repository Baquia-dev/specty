// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CHANGE, CONFIG, cli, git, person, read, tempRepo, writeFiles } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");
const FIRST = CHANGE.replace("saludo-personalizado", "inicio-de-sesion");
const SECOND = CHANGE.replace("saludo-personalizado", "panel");
const EPIC_DIR = `.specty/changes/${EPIC}`;
/** Where `new --worktree` puts the worktrees of `root`. */
const home = (root: string) => join(dirname(root), `${basename(root)}.worktrees`);

const EPIC_SPEC = `---
kind: epic
---

# Panel del estudiante

## Objetivo

El estudiante ve su progreso de un vistazo.

## Fuera de alcance

- Exportar el progreso.

## Supuestos

- A1: El progreso ya se guarda por curso.

## Criterios de aceptación

- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.
- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.

## Cortes

- C1: Inicio de sesión
  - ac: AC1
- C2: Panel
  - ac: AC2
  - depends: C1
`;

/**
 * An approved epic, in `root` itself (this repository works without worktrees). Its full
 * verification fails: an epic has no code of its own, so nothing should run it.
 */
async function approvedEpic(): Promise<string> {
  const config = `${CONFIG()}  full: "exit 3"\n`;
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": config });
  expect((await cli(root, ["new", "--kind", "epic", "Panel del estudiante"])).code).toBe(0);
  await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: EPIC_SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  return root;
}

/** A closed slice change in the main folder's archive, as a closed child is once incorporated. */
async function archiveChild(root: string, id: string, slice: string): Promise<void> {
  const state = JSON.parse(await read(root, `${EPIC_DIR}/state.json`));
  await writeFiles(root, {
    [`.specty/archive/2026/${id}/spec.md`]: `---\nkind: standard\nepic: ${EPIC}\nslice: ${slice}\n---\n\n# ${id}\n`,
    [`.specty/archive/2026/${id}/state.json`]: JSON.stringify({
      ...state,
      id,
      kind: "standard",
      phase: "done",
    }),
  });
}

describe("specty new --epic --slice", () => {
  it("refuses a slice that cannot start, and creates nothing (AC3)", async () => {
    const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "--kind", "epic", "Panel del estudiante"]);
    await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: EPIC_SPEC });
    await cli(root, ["propose"]);
    const slice = (title: string, ...options: string[]) =>
      cli(root, ["new", "--worktree", title, ...options]);
    const refused = async (title: string, options: string[], code: number, reason: string) => {
      const result = await slice(title, ...options);
      expect([result.code, result.out]).toEqual([code, expect.stringContaining(reason)]);
    };
    await refused("Inicio de sesión", ["--epic", EPIC, "--slice", "C1"], 2, "aún no está aprobada");
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    await refused("Inicio de sesión", ["--epic", EPIC], 1, "`--epic` y `--slice` van juntos");
    await refused("Inicio de sesión", ["--slice", "C1"], 1, "`--epic` y `--slice` van juntos");
    const other = ["--epic", "20200101-ninguna", "--slice", "C1"];
    await refused("Inicio de sesión", other, 1, "No hay ninguna épica abierta 20200101-ninguna.");
    await refused(
      "Exportar",
      ["--epic", EPIC, "--slice", "C9"],
      1,
      `La épica ${EPIC} no tiene el corte C9; sus cortes: C1, C2.`,
    );
    await refused(
      "Panel",
      ["--epic", EPIC, "--slice", "C2"],
      2,
      "El corte C2 depende de cortes que aún no están cerrados: C1.",
    );
    expect(await exists(join(home(root), SECOND))).toBe(false);

    expect((await slice("Inicio de sesión", "--epic", EPIC, "--slice", "C1")).code).toBe(0);
    const created = (await read(join(home(root), FIRST), `.specty/changes/${FIRST}/audit.jsonl`))
      .trim()
      .split("\n");
    expect(JSON.parse(created[0] ?? "{}").data).toMatchObject({ epic: EPIC, slice: "C1" });
    await refused(
      "Otra vez",
      ["--epic", EPIC, "--slice", "C1"],
      2,
      `El corte C1 ya tiene un cambio: ${FIRST}, en draft.`,
    );
  });
});

describe("an epic", () => {
  it("lists its slices and moves to acceptance once every one is closed (AC1, AC2)", async () => {
    const root = await approvedEpic();
    const start = (await cli(root, ["next"])).out;
    expect(start).toContain(
      "CORTES (0 de 2 cerrados):\n  C1 Inicio de sesión — listo para empezar\n  C2 Panel — espera a C1",
    );
    expect(start).toContain(
      `SIGUIENTE: empieza el corte C1: \`specty new "Inicio de sesión" --epic ${EPIC} --slice C1\` y sigue su salida.`,
    );

    await archiveChild(root, FIRST, "C1");
    const second = await cli(root, ["new", "--worktree", "Panel", "--epic", EPIC, "--slice", "C2"]);
    expect(second.code).toBe(0);
    const folder = join(home(root), SECOND);
    const progress = (await cli(root, ["next"])).out;
    expect(progress).toContain(
      `CORTES (1 de 2 cerrados):\n  C1 Inicio de sesión — cerrado (${FIRST})\n  C2 Panel — en curso: ${SECOND}, en draft`,
    );
    expect(progress).toContain(`SIGUIENTE: sigue con el corte C2 en su carpeta, `);
    expect(progress).toContain(`${basename(folder)}: ejecuta \`specty next\` allí.`);

    const childState = `.specty/changes/${SECOND}/state.json`;
    const child = JSON.parse(await read(folder, childState));
    await writeFiles(folder, { [childState]: JSON.stringify({ ...child, phase: "done" }) });
    const done = (await cli(root, ["next"])).out;
    expect(done).toContain(`SPECTY · ${EPIC} · acceptance`);
    expect(done).toContain(
      `CORTES:\n  C1 Inicio de sesión — cerrado (${FIRST})\n  C2 Panel — cerrado (${SECOND})`,
    );
    const audit = (await read(root, `${EPIC_DIR}/audit.jsonl`)).trim().split("\n");
    expect(JSON.parse(audit.at(-1) ?? "{}")).toMatchObject({
      actor: "specty",
      event: "epic.slicesDone",
      data: { slices: { C1: FIRST, C2: SECOND } },
    });

    const terminal = person();
    expect((await cli(root, ["accept"], { terminal })).code).toBe(0);
    expect(terminal.notes.join("\n")).toContain(`C2 Panel — cerrado (${SECOND})`);
    expect(await read(root, `${EPIC_DIR}/audit.jsonl`)).not.toContain('"change.verified"');
    // The main branch moves meanwhile: incorporating the epic merges it, and verifies nothing.
    const other = join(dirname(root), `${basename(root)}-main`);
    git(root, "worktree", "add", "-q", other, "main");
    await writeFiles(other, { "src/otro.ts": "2\n" });
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "Otro cambio");
    git(root, "worktree", "remove", other);
    const closing =
      "\n## Cierre\n\n### Resumen\n\nPanel listo.\n\n### Desviaciones\n\n- Ninguna.\n\n### Decisiones\n\n- Ninguna.\n\n### Pendientes\n\n- Ninguno.\n";
    const spec = `${EPIC_DIR}/spec.md`;
    await writeFiles(root, { [spec]: `${await read(root, spec)}${closing}` });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const closed = await cli(root, ["close"], { terminal: person() });
    expect([closed.code, closed.out]).toEqual([0, expect.stringContaining("Incorporado a main")]);
    expect(closed.out).toContain("sin verificar: una épica no tiene código propio");
    expect(git(root, "ls-tree", "-r", "--name-only", "main")).toContain("src/otro.ts");
  });
});
