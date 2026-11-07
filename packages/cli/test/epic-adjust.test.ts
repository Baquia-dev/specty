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
  toAcceptance,
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
  it("AC1: refuses a change with tasks out of its implementation and its acceptance, and keeps its phase", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    const dir = `.specty/changes/${CHANGE}`;
    expect(await phaseOf(root, dir)).toBe("review");
    const refused = await cli(root, ["adjust", "Algo"]);
    expect([refused.code, refused.out]).toEqual([
      2,
      expect.stringContaining(
        "Los ajustes se piden mientras se implementan sus tareas o con el resultado en aceptación.",
      ),
    ]);
    expect(await phaseOf(root, dir)).toBe("review");
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

const CONTRACT = `${CONFIG()}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;
/** T1's verification as written: it fails naming the test without running it, as a suite that does not load. */
const WRONG = "echo src/app.test.ts no carga && false";
const RIGHT = "grep -q Hola src/app.ts";
const MIDWAY_SPEC = SPEC.replace(
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n",
  `  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - verify: ${WRONG}\n`,
).replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));

describe("an adjustment of a change with tasks while it is implemented", () => {
  it("AC1 AC3: corrects a pending task's verify and goes back to it with no tests phase, under contract", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONTRACT });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: MIDWAY_SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda a Ana', () => {});\n" });
    const red = await cli(root, ["propose"]);
    expect(red.code, red.out).toBe(0);
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n" });
    const failed = await cli(root, ["task", "done", "T1", "--summary", "Saluda"]);
    expect(failed.code).toBe(2);
    expect(failed.out).toContain("corrígela antes con `specty adjust");
    const before = await stateOf(root);
    expect(before.tasks.T1.status).toBe("active");

    const asked = await cli(root, ["adjust", "La verify de T1 no ejecuta su test"]);
    expect(asked.code, asked.out).toBe(0);
    expect(asked.out).toContain("CÓMO CORREGIRLAS:");
    expect((await stateOf(root)).phase).toBe("adjusting");
    const spec = await read(root, SPEC_PATH);
    // A new task waits for the acceptance: only the pending ones are corrected now.
    await writeFiles(root, {
      [SPEC_PATH]: `${spec}- [ ] T3: Otra\n  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n`,
    });
    const outside = await cli(root, ["propose"]);
    expect(outside.code).not.toBe(0);
    expect(outside.out).toContain("solo corrige las tareas pendientes");
    await writeFiles(root, { [SPEC_PATH]: spec.replace(`verify: ${WRONG}`, `verify: ${RIGHT}`) });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.code, proposed.out).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code, approved.out).toBe(0);

    const after = await stateOf(root);
    expect(after.phase).toBe("implementing");
    expect(after.testCycle).toBeUndefined();
    expect(after.lockedTests).toEqual(before.lockedTests);
    expect(Object.keys(after.lockedTests)).toEqual(["src/app.test.ts"]);
    expect(after.tasks.T1).toMatchObject({
      status: "active",
      baseCommit: before.tasks.T1.baseCommit,
      startedAt: before.tasks.T1.startedAt,
    });
    expect((await cli(root, ["next"])).out).toContain(`VERIFICACIÓN: ${RIGHT}`);
    const done = await cli(root, ["task", "done", "T1", "--summary", "Saluda"]);
    expect(done.code, done.out).toBe(0);
    expect((await stateOf(root)).tasks.T1.status).toBe("done");
  });
});

describe("the adjusting card of a change with tasks", () => {
  const repo = () => tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });

  it("AC1: asks to correct the pending tasks when adjusted right after the approval, before `next`", async () => {
    const root = await repo();
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code, approved.out).toBe(0);
    const before = await stateOf(root);
    expect(before.phase).toBe("implementing");
    expect(
      Object.values(before.tasks).map((task) => (task as { status: string }).status),
    ).not.toContain("active");

    const asked = await cli(root, ["adjust", "La verify de T1 no carga sus tests"]);
    expect(asked.code, asked.out).toBe(0);
    expect(asked.out).toContain("CÓMO CORREGIRLAS:");
    expect(asked.out).not.toContain("CÓMO CLASIFICARLA:");
  });

  it("AC2: classifies a request of the acceptance, also once the spec adds a task still to do", async () => {
    const root = await repo();
    await cli(root, ["new", "Saludo personalizado"]);
    await toAcceptance(root);
    expect((await stateOf(root)).phase).toBe("acceptance");
    const asked = await cli(root, ["adjust", "Que el saludo use mayúsculas"]);
    expect(asked.code, asked.out).toBe(0);
    expect(asked.out).toContain("CÓMO CLASIFICARLA:");
    const spec = await read(root, SPEC_PATH);
    await writeFiles(root, {
      [SPEC_PATH]: `${spec}- [ ] T3: Mayúsculas\n  - files: src/app.ts\n  - ac: AC1\n  - type: fix\n`,
    });
    const next = await cli(root, ["next"]);
    expect(next.out).toContain("CÓMO CLASIFICARLA:");
    expect(next.out).not.toContain("CÓMO CORREGIRLAS:");
  });
});
