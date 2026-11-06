// SPDX-License-Identifier: Apache-2.0
import { makeChangeId } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, NOW, person, tempRepo, toClosing } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);
const resolve = (cwd: string, ...ids: string[]) => cli(cwd, ["memory", "resolve", ...ids], CLAUDE);

/** How many commits the memory's branch has. */
const memoryCommits = (root: string) => git(root, "rev-list", "--count", "specty-memory");

/** A repository whose memory has the pending items `texts`, and SPEC's change in its own folder. */
async function withChange(...texts: string[]) {
  const root = await tempRepo(APP);
  for (const text of texts) expect((await add(root, text)).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return { root, folder: folderOf(root) };
}

describe("specty memory resolve", () => {
  it("AC1: takes the entries for the open change of the folder, as every folder sees", async () => {
    const { root, folder } = await withChange("Uno", "Dos", "Tres");
    const taken = await resolve(folder, "p1", "P3");
    expect(taken.code).toBe(0);
    expect(taken.out).toContain(
      "RESUELVE:\n  P1 · pendiente · Uno\n  P3 · pendiente · Tres\n  Quedan hechas al cerrarse este cambio, y libres si se cancela.\n",
    );
    const listed = (await cli(root, ["memory"])).out;
    expect(listed).toContain(`P1 · pendiente · tomada por ${CHANGE} · Uno`);
    expect(listed).toContain(`P3 · pendiente · tomada por ${CHANGE} · Tres`);
    expect(listed).toContain("P2 · pendiente · Dos");
  });

  it("AC1: leaves an entry this change already took as it is, without writing", async () => {
    const { root, folder } = await withChange("Uno");
    expect((await resolve(folder, "P1")).code).toBe(0);
    const commits = memoryCommits(root);
    const again = await resolve(folder, "P1");
    expect(again.code).toBe(0);
    expect(again.out).toContain("P1 · pendiente · Uno");
    expect(memoryCommits(root)).toBe(commits);
    expect((await cli(root, ["memory"])).out).toContain(
      `P1 · pendiente · tomada por ${CHANGE} · Uno`,
    );
  });

  it("AC2: the entries it took are done when the change closes, and the closing names them", async () => {
    const { root, folder } = await withChange("Uno", "Dos");
    expect((await resolve(folder, "P1")).code).toBe(0);
    await toClosing(folder);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain(
      "PENDIENTES QUE RESOLVIÓ ESTE CAMBIO:\n  P1 · Uno\n  Quedan hechos y salen de la lista de abiertos.\n",
    );
    expect((await cli(root, ["memory", "--all"])).out).toContain("P1 · pendiente · hecha · Uno");
    const open = (await cli(root, ["memory"])).out;
    expect(open).not.toContain("P1 ·");
    expect(open).toContain("P2 · pendiente · Dos");
  });

  it("AC2: the entries it took are free again when the change is cancelled", async () => {
    const { root, folder } = await withChange("Uno");
    expect((await resolve(folder, "P1")).code).toBe(0);
    const cancelled = await cli(folder, ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    expect(cancelled.out).not.toContain("PENDIENTES QUE RESOLVIÓ ESTE CAMBIO");
    const open = (await cli(root, ["memory"])).out;
    expect(open).toContain("P1 · pendiente · Uno");
    expect(open).not.toContain("tomada");
  });

  it("AC3: takes none of the entries it names when one is unknown, closed, a reminder or a decision", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, "Uno")).code).toBe(0);
    expect((await add(root, "Recompilar el dist", "--kind", "reminder")).code).toBe(0);
    expect((await add(root, "Rama propia", "--kind", "decision", "--quote", "sí")).code).toBe(0);
    expect((await add(root, "Subir la rama", "--kind", "reminder")).code).toBe(0);
    expect((await cli(root, ["memory", "done", "P3"], CLAUDE)).code).toBe(0);
    expect((await add(root, "Cuatro")).code).toBe(0);
    const dropped = await cli(root, ["memory", "drop", "P4", "--reason", "Ya no aplica."], {
      terminal: person(),
    });
    expect(dropped.code).toBe(0);
    expect((await add(root, "Cinco")).code).toBe(0);
    expect(
      (await cli(root, ["memory", "drop", "P5", "--reason", "Duplica P1."], CLAUDE)).code,
    ).toBe(0);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const folder = folderOf(root);
    const cases = [
      ["P9", "La memoria no tiene la entrada P9."],
      ["P2", "P2 es un recordatorio: `specty memory resolve` solo toma pendientes y mejoras."],
      ["D1", "D1 es una decisión: `specty memory resolve` solo toma pendientes y mejoras."],
      ["P3", "P3 ya está hecha: no se puede tomar."],
      ["P4", "P4 ya está descartada: no se puede tomar."],
      ["P5", "P5 ya está propuesta para descartar: no se puede tomar."],
    ] as const;
    for (const [id, why] of cases) {
      const refused = await resolve(folder, "P1", id);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain(why);
    }
    expect((await cli(root, ["memory"])).out).toContain("P1 · pendiente · Uno");
  });

  it("AC3: refuses an entry another open change took, saying which", async () => {
    const root = await tempRepo(APP);
    for (const text of ["Uno", "Dos"]) expect((await add(root, text)).code).toBe(0);
    const first = await cli(root, [
      "new",
      "--worktree",
      "Saludo personalizado",
      "--resolves",
      "P1",
    ]);
    expect(first.code).toBe(0);
    const title = "Exportar informes en CSV";
    expect((await cli(root, ["new", "--worktree", title])).code).toBe(0);
    const refused = await resolve(folderOf(root, makeChangeId(NOW, title)), "P2", "P1");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(`P1 ya la tomó el cambio ${CHANGE} (draft`);
    expect(refused.out).toContain(
      "SIGUIENTE: la resolverá ese cambio al cerrarse: vuelve a ejecutarlo sin P1, o sigue con `specty next`.",
    );
    const listed = (await cli(root, ["memory"])).out;
    expect(listed).toContain(`P1 · pendiente · tomada por ${CHANGE} · Uno`);
    expect(listed).toContain("P2 · pendiente · Dos");
  });

  it("AC4: takes nothing in a folder without an open change, though another folder has one", async () => {
    const { root } = await withChange("Uno");
    const refused = await resolve(root, "P1");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      "No hay un cambio abierto en esta carpeta: `specty memory resolve` toma las entradas para ese cambio.",
    );
    expect((await cli(root, ["memory"])).out).toContain("P1 · pendiente · Uno");
  });
});
