// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, read, tempRepo, writeFiles } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel-del-estudiante");
const OTHER_EPIC = CHANGE.replace("saludo-personalizado", "tablero-del-alumno");
const SLICE = CHANGE.replace("saludo-personalizado", "inicio-de-sesion");
const FIX = CHANGE.replace("saludo-personalizado", "arreglo-del-acceso");

const REQUEST = "Quiero un panel del estudiante con su progreso por curso";
const FOLLOW_UP = "Arreglar el panel del estudiante con su progreso por curso";

/** `new` of a change in a worktree of its own. */
const another = (root: string, title: string, ...args: string[]) =>
  cli(root, ["new", "--worktree", title, ...args]);

/**
 * An open epic with `REQUEST`, and its slice C1 closed and archived in the main folder, as a
 * closed slice is once incorporated.
 */
async function epicWithClosedSlice(): Promise<string> {
  const root = await tempRepo(APP);
  const epic = await another(root, "Panel del estudiante", "--kind", "epic", "--request", REQUEST);
  expect(epic.code).toBe(0);
  const statePath = join(".worktrees", EPIC, ".specty", "changes", EPIC, "state.json");
  const state = JSON.parse(await read(root, statePath));
  await writeFiles(root, {
    [`.specty/archive/2026/${SLICE}/spec.md`]: `---\nkind: standard\nepic: ${EPIC}\nslice: C1\n---\n\n# Inicio de sesión\n`,
    [`.specty/archive/2026/${SLICE}/state.json`]: JSON.stringify({
      ...state,
      id: SLICE,
      kind: "standard",
      phase: "done",
    }),
  });
  return root;
}

describe("specty new following a slice of an open epic", () => {
  it("AC1: does not stop it for a request like that epic's", async () => {
    const root = await epicWithClosedSlice();
    const created = await another(
      root,
      "Arreglo del acceso",
      "--follows",
      SLICE,
      "--request",
      FOLLOW_UP,
    );
    expect(created.out).not.toContain("Puede duplicar");
    expect(created.code).toBe(0);
    expect(created.out).toContain(`SPECTY · ${FIX} · draft`);
  });

  it("AC2: still stops it for a request like another open epic's, naming only that one", async () => {
    const root = await epicWithClosedSlice();
    const other = await another(
      root,
      "Tablero del alumno",
      "--kind",
      "epic",
      "--request",
      REQUEST,
      "--distinct-from",
      EPIC,
    );
    expect(other.code).toBe(0);
    const refused = await another(
      root,
      "Arreglo del acceso",
      "--follows",
      SLICE,
      "--request",
      FOLLOW_UP,
    );
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("Puede duplicar un cambio abierto:");
    expect(refused.out).toContain(`${OTHER_EPIC} (draft`);
    expect(refused.out).not.toContain(`${EPIC} (draft`);
  });
});
