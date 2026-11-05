// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, read, SPEC, SPEC_PATH, writeFiles } from "../support";
import { call, serving } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");

const EPIC_SPEC = `---
kind: epic
---

# Panel del estudiante

## Objetivo

El estudiante ve su progreso de un vistazo.

## Criterios de aceptación

- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.
- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.

## Cortes

- C1: Inicio de sesión
  - ac: AC1
- C2: Panel
  - ac: AC2
  - depends: C1
- C3: Avisos
  - ac: AC2
  - depends: C2
`;

/** A change implementing `slice` of the epic. */
const sliceSpec = (slice: string) =>
  `---\nkind: standard\nepic: ${EPIC}\nslice: ${slice}\n---\n\n# Corte ${slice}\n`;

/** An archived change in the main folder, with the state of the open one as its base. */
async function archived(root: string, id: string, spec: string, kind: string, phase: string) {
  const base = JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
  await writeFiles(root, {
    [`.specty/archive/2026/${id}/spec.md`]: spec,
    [`.specty/archive/2026/${id}/state.json`]: JSON.stringify({ ...base, id, kind, phase }),
  });
}

describe("the changes of an epic's slices in the local server", () => {
  it("AC1: gives the change of each slice of an epic as its card picks it, open or archived", async () => {
    const { root, server, headers } = await serving(false);
    try {
      await archived(root, EPIC, EPIC_SPEC, "epic", "done");
      // C1: a cancelled change does not count, and the closed one wins.
      await archived(root, "20261019-inicio-cancelado", sliceSpec("C1"), "standard", "cancelled");
      await archived(root, "20261019-inicio-de-sesion", sliceSpec("C1"), "standard", "done");
      // C2: only a cancelled change, archived, and the open change in review.
      await archived(root, "20261019-panel-cancelado", sliceSpec("C2"), "standard", "cancelled");
      await writeFiles(root, {
        [SPEC_PATH]: SPEC.replace("kind: standard\n", `kind: standard\nepic: ${EPIC}\nslice: C2\n`),
      });

      const answer = await call(server.port, `/api/changes/${EPIC}/slices`, headers);
      expect(answer.status).toBe(200);
      expect(JSON.parse(answer.body)).toEqual([
        { slice: "C1", id: "20261019-inicio-de-sesion", phase: "done" },
        { slice: "C2", id: CHANGE, phase: "review" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("AC1: gives no slices for a change that is not an epic, and 404 for an unknown id", async () => {
    const { server, headers } = await serving(false);
    try {
      const plain = await call(server.port, `/api/changes/${CHANGE}/slices`, headers);
      expect(plain.status).toBe(200);
      expect(JSON.parse(plain.body)).toEqual([]);
      const unknown = await call(server.port, "/api/changes/20990101-nada/slices", headers);
      expect(unknown.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
