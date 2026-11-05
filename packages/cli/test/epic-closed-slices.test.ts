// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { ARCHIVE, CHANGE, CONFIG, cli, person, read, tempRepo, writeFiles } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");
const FIRST = CHANGE.replace("saludo-personalizado", "inicio-de-sesion");
const SECOND = CHANGE.replace("saludo-personalizado", "panel");
const EPIC_DIR = `.specty/changes/${EPIC}`;
const REQUEST = "C2 sale XL: divídelo";
const CLOSED_C1 = `El corte C1 ya se cerró con el cambio ${FIRST}`;

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

/** The epic once C2 came out XL: the notes go to a new slice, C3. */
const SPLIT_SPEC = EPIC_SPEC.replace(
  "- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.\n",
  "- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.\n- AC3: CUANDO el estudiante abre un curso de su panel ENTONCES ve sus notas.\n",
).concat("- C3: Notas por curso\n  - ac: AC3\n  - depends: C1\n");

/** An approved epic in `root` itself, now being implemented. */
async function epic(): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": CONFIG() });
  expect((await cli(root, ["new", "--kind", "epic", "Panel del estudiante"])).code).toBe(0);
  await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: EPIC_SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  return root;
}

/** A slice change in the main folder's archive, closed or cancelled. */
async function archiveChild(
  root: string,
  id: string,
  slice: string,
  phase: "done" | "cancelled",
): Promise<void> {
  const state = JSON.parse(await read(root, `${EPIC_DIR}/state.json`));
  await writeFiles(root, {
    [`${ARCHIVE}/${id}/spec.md`]: `---\nkind: standard\nepic: ${EPIC}\nslice: ${slice}\n---\n\n# ${id}\n`,
    [`${ARCHIVE}/${id}/state.json`]: JSON.stringify({ ...state, id, kind: "standard", phase }),
  });
}

/** Adjusts the epic and proposes `spec` for it. */
async function proposeAdjustment(root: string, spec: string) {
  expect((await cli(root, ["adjust", REQUEST])).code).toBe(0);
  await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: spec });
  return cli(root, ["propose"]);
}

async function phaseOf(root: string): Promise<string> {
  return JSON.parse(await read(root, `${EPIC_DIR}/state.json`)).phase;
}

describe("`propose` of an epic's adjustment, with its closed slices", () => {
  it("AC1: rejects changing a closed slice, and names the slice and its change", async () => {
    const root = await epic();
    await archiveChild(root, FIRST, "C1", "done");
    const changed = SPLIT_SPEC.replace(
      "- C1: Inicio de sesión",
      "- C1: Inicio de sesión y registro",
    );
    const refused = await proposeAdjustment(root, changed);
    expect([refused.code, refused.out]).toEqual([1, expect.stringContaining(CLOSED_C1)]);
    expect(refused.out).toContain("lleva lo que falte a un corte nuevo");
    expect(await phaseOf(root)).toBe("adjusting");

    await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: SPLIT_SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect(await phaseOf(root)).toBe("review");
  });

  it("AC2: rejects removing a closed slice", async () => {
    const root = await epic();
    await archiveChild(root, FIRST, "C1", "done");
    const removed = EPIC_SPEC.replace("- C1: Inicio de sesión\n  - ac: AC1\n", "")
      .replace("  - depends: C1\n", "")
      .replace("- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.\n", "");
    const refused = await proposeAdjustment(root, removed);
    expect([refused.code, refused.out]).toEqual([1, expect.stringContaining(CLOSED_C1)]);
    expect(await phaseOf(root)).toBe("adjusting");
  });

  it("AC3: accepts new slices, and changing the slices whose change is open or cancelled", async () => {
    const root = await epic();
    const started = await cli(root, [
      "new",
      "--worktree",
      "Inicio de sesión",
      "--epic",
      EPIC,
      "--slice",
      "C1",
    ]);
    expect(started.code).toBe(0);
    await archiveChild(root, SECOND, "C2", "cancelled");
    const changed = SPLIT_SPEC.replace(
      "- C1: Inicio de sesión",
      "- C1: Inicio de sesión y registro",
    ).replace("- C2: Panel", "- C2: Panel sin notas");
    const proposed = await proposeAdjustment(root, changed);
    expect(proposed.code).toBe(0);
    expect(proposed.out).not.toContain("ya se cerró con el cambio");
    expect(await phaseOf(root)).toBe("review");
  });
});
