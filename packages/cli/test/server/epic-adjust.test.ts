// SPDX-License-Identifier: Apache-2.0
// The person asks the local server to adjust an epic while its slices are implemented: the
// server runs `specty adjust`, which admits it, as for any change while its tasks are implemented.
import { describe, expect, it } from "vitest";
import { CHANGE, cli, person, read, writeFiles } from "../support";
import { call, path, serving, state } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");
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

describe("the person's adjustment of an epic in the local server", () => {
  it("AC7 AC1: adjusts an epic in implementation in its folder, and a feature in implementation", async () => {
    const { root, server, headers } = await serving();
    try {
      // A feature in implementation, in the main folder: adjusted to correct its pending tasks.
      await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      await cli(root, ["next"]);
      expect((await state(root)).phase).toBe("implementing");
      const feature = await call(server.port, path("adjust"), headers, { request: REQUEST });
      expect(feature.status, feature.body).toBe(200);
      expect(await state(root)).toMatchObject({
        phase: "adjusting",
        pending: { adjustment: { request: REQUEST } },
      });

      // An epic in implementation, in its own folder.
      const created = await cli(root, [
        "new",
        "--worktree",
        "--kind",
        "epic",
        "Panel del estudiante",
      ]);
      expect(created.code, created.out).toBe(0);
      const folder = `${root}/.worktrees/${EPIC}`;
      const epicState = `.specty/changes/${EPIC}/state.json`;
      await writeFiles(folder, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
      expect((await cli(folder, ["propose"])).code).toBe(0);
      expect((await cli(folder, ["approve"], { terminal: person() })).code).toBe(0);
      expect(JSON.parse(await read(folder, epicState)).phase).toBe("implementing");

      const adjusted = await call(server.port, `/api/changes/${EPIC}/adjust`, headers, {
        request: REQUEST,
      });
      expect(adjusted.status, adjusted.body).toBe(200);
      expect(JSON.parse(await read(folder, epicState))).toMatchObject({
        phase: "adjusting",
        pending: { adjustment: { request: REQUEST } },
      });
    } finally {
      await server.close();
    }
  });
});
