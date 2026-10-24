// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, cli, person, read, tempRepo, writeFiles } from "./support";

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

/** An approved epic, in `root` itself (this repository works without worktrees). */
async function approvedEpic(): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": CONFIG() });
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
  });
});
