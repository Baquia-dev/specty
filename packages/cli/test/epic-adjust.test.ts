// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");
const FIRST = CHANGE.replace("saludo-personalizado", "inicio-de-sesion");
const SECOND = CHANGE.replace("saludo-personalizado", "panel");
const EPIC_DIR = `.specty/changes/${EPIC}`;
const REQUEST = "C2 sale XL: divídelo";

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

/** The epic once C2 came out XL: C2 keeps the panel, and the notes go to a new slice, C3. */
const SPLIT_SPEC = EPIC_SPEC.replace(
  "- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.\n",
  "- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.\n- AC3: CUANDO el estudiante abre un curso de su panel ENTONCES ve sus notas.\n",
).concat("- C3: Notas por curso\n  - ac: AC3\n  - depends: C1\n");

/** An epic in `root` itself, proposed and, unless `approve` is false, approved by the person. */
async function epic(approve = true): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": CONFIG() });
  expect((await cli(root, ["new", "--kind", "epic", "Panel del estudiante"])).code).toBe(0);
  await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: EPIC_SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  if (approve) expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  return root;
}

/** A closed slice change in the main folder's archive, as a closed child is once incorporated. */
async function archiveChild(root: string, id: string, slice: string): Promise<void> {
  const state = JSON.parse(await read(root, `${EPIC_DIR}/state.json`));
  await writeFiles(root, {
    [`${ARCHIVE}/${id}/spec.md`]: `---\nkind: standard\nepic: ${EPIC}\nslice: ${slice}\n---\n\n# ${id}\n`,
    [`${ARCHIVE}/${id}/state.json`]: JSON.stringify({
      ...state,
      id,
      kind: "standard",
      phase: "done",
    }),
  });
}

async function phaseOf(root: string, dir = EPIC_DIR): Promise<string> {
  return JSON.parse(await read(root, `${dir}/state.json`)).phase;
}

describe("an epic adjusted while its slices are implemented", () => {
  it("AC1: moves to adjusting with the request, and says how to split a slice", async () => {
    const root = await epic();
    expect(await phaseOf(root)).toBe("implementing");
    const adjusted = await cli(root, ["adjust", REQUEST]);
    expect(adjusted.code).toBe(0);
    expect(adjusted.out).toContain(`SPECTY · ${EPIC} · adjusting`);
    expect(adjusted.out).toContain(`PETICIÓN:\n  ${REQUEST}`);
    expect(adjusted.out).toContain(
      "Un corte que sale demasiado grande: estréchalo a lo que cabe en un cambio",
    );
    expect(adjusted.out).toContain("No cambies ni borres los cortes cerrados; usa ids nuevos.");
    const state = JSON.parse(await read(root, `${EPIC_DIR}/state.json`));
    expect(state.phase).toBe("adjusting");
    expect(state.pending.adjustment.request).toBe(REQUEST);
  });

  it("AC2: is implemented again once approved, and a new slice starts when its dependencies close", async () => {
    const root = await epic();
    expect((await cli(root, ["adjust", REQUEST])).code).toBe(0);
    await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: SPLIT_SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect(await phaseOf(root)).toBe("review");
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    expect(await phaseOf(root)).toBe("implementing");
    expect((await cli(root, ["next"])).out).toContain("C3 Notas por curso — espera a C1");

    const start = () =>
      cli(root, ["new", "--worktree", "Notas por curso", "--epic", EPIC, "--slice", "C3"]);
    const waiting = await start();
    expect([waiting.code, waiting.out]).toEqual([
      2,
      expect.stringContaining("El corte C3 depende de cortes que aún no están cerrados: C1."),
    ]);
    await archiveChild(root, FIRST, "C1");
    expect((await start()).code).toBe(0);
  });

  it("AC5: stays in adjusting when its slices close meanwhile, and goes to acceptance once approved", async () => {
    const root = await epic();
    expect((await cli(root, ["adjust", REQUEST])).code).toBe(0);
    await archiveChild(root, FIRST, "C1");
    await archiveChild(root, SECOND, "C2");
    expect((await cli(root, ["next"])).out).toContain(`SPECTY · ${EPIC} · adjusting`);
    expect(await phaseOf(root)).toBe("adjusting");

    expect((await cli(root, ["propose"])).code).toBe(0);
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["next"])).out).toContain(`SPECTY · ${EPIC} · acceptance`);
    expect(await phaseOf(root)).toBe("acceptance");
  });
});

describe("`specty adjust` outside its phases", () => {
  it("AC3: refuses any other change while it is implemented, and keeps its phase", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    const dir = `.specty/changes/${CHANGE}`;
    expect(await phaseOf(root, dir)).toBe("implementing");
    const refused = await cli(root, ["adjust", "Algo"]);
    expect([refused.code, refused.out]).toEqual([
      2,
      expect.stringContaining("Los ajustes se piden cuando el resultado está en aceptación."),
    ]);
    expect(await phaseOf(root, dir)).toBe("implementing");
  });

  it("AC4: tells an epic out of both phases when its adjustments are requested", async () => {
    const root = await epic(false);
    expect(await phaseOf(root)).toBe("review");
    const refused = await cli(root, ["adjust", REQUEST]);
    expect([refused.code, refused.out]).toEqual([
      2,
      expect.stringContaining(
        "Los ajustes de una épica se piden mientras se implementan sus cortes o con el resultado en aceptación.",
      ),
    ]);
    expect(await phaseOf(root)).toBe("review");
  });
});
