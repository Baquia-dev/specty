// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, cli, person, tempRepo, writeFiles } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");
const REPORT = CHANGE.replace("saludo-personalizado", "informe-para-secretaria");
const SLICE = CHANGE.replace("saludo-personalizado", "inicio-de-sesion");
const EPIC_DIR = `.specty/changes/${EPIC}`;

/** A generic literal request, the same for the epic, its slices and a change outside it. */
const REQUEST = "Procede con lo que queda pendiente aprobando, aceptando y cerrando cada uno";

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
 * An approved epic created with `REQUEST`, in `root` itself (this repository works without
 * worktrees), and an open change outside the epic created with the same request.
 */
async function epicAndUnrelatedChange(): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": CONFIG() });
  const epic = ["new", "--kind", "epic", "Panel del estudiante", "--request", REQUEST];
  expect((await cli(root, epic)).code).toBe(0);
  await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: EPIC_SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  const report = ["new", "--worktree", "Informe para secretaría", "--request", REQUEST];
  expect((await cli(root, [...report, "--distinct-from", EPIC])).code).toBe(0);
  return root;
}

/** `new` of the epic's slice C1, in a worktree of its own. */
const slice = (root: string, title: string, request: string) =>
  cli(root, ["new", "--worktree", title, "--epic", EPIC, "--slice", "C1", "--request", request]);

describe("specty new of a slice with its epic's request", () => {
  it("does not stop it for another open change created with that request", async () => {
    const root = await epicAndUnrelatedChange();
    const created = await slice(root, "Inicio de sesión", ` ${REQUEST} `);
    expect(created.out).not.toContain("Puede duplicar");
    expect(created.code).toBe(0);
    expect(created.out).toContain(`SPECTY · ${SLICE} · draft`);
  });

  it("still stops it for a request like that change's but not the epic's", async () => {
    const root = await epicAndUnrelatedChange();
    const refused = await slice(root, "Inicio de sesión", `${REQUEST} sin preguntar`);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(`${REPORT} (draft`);
    expect(refused.out).toContain("— «Informe para secretaría»: petición parecida");
  });

  it("still stops it for a title like that change's, with the epic's request", async () => {
    const root = await epicAndUnrelatedChange();
    const refused = await slice(root, "Informe de secretaría", REQUEST);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("— «Informe para secretaría»: título parecido");
  });
});
