// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, inWorktree, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

describe("next with no active change", () => {
  it("AC1: neither lists nor counts the open pending items and improvements, from any folder", async () => {
    const { root, folder } = await inWorktree();
    for (const text of ["Uno", "Dos", "Tres", "Cuatro"]) {
      expect((await add(folder, text)).code).toBe(0);
    }
    expect((await add(root, "Una mejora", "--kind", "improvement")).code).toBe(0);
    const card = (await cli(root, ["next"])).out;
    expect(card).not.toContain("MEMORIA DE SPECTY");
    for (const id of ["P1", "P2", "P3", "P4", "P5"]) expect(card).not.toContain(`${id} ·`);
    expect(card).not.toContain("`specty memory`");
  });

  it("AC1: is the card of before with pending items, improvements and decisions open", async () => {
    const root = await tempRepo(APP);
    const before = (await cli(root, ["next"])).out;
    expect(before).not.toContain("MEMORIA DE SPECTY");
    expect(before).toContain("No hay un cambio activo.");
    expect((await add(root, "Uno")).code).toBe(0);
    expect((await add(root, "Una mejora", "--kind", "improvement")).code).toBe(0);
    const decided = await add(root, "Usar la rama propia", "--kind", "decision", "--quote", "sí");
    expect(decided.code).toBe(0);
    expect((await cli(root, ["next"])).out).toBe(before);
  });

  it("AC1: does not show them in the card of an active change", async () => {
    const { folder } = await inWorktree();
    await add(folder, "Uno");
    expect((await cli(folder, ["next"])).out).not.toContain("MEMORIA DE SPECTY");
  });

  it("AC1: shows the open reminders until someone marks them done", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, "Recompilar el dist de main", "--kind", "reminder")).code).toBe(0);
    expect((await add(root, "Uno")).code).toBe(0);
    const card = (await cli(root, ["next"])).out;
    expect(card).toContain("RECORDATORIOS:\n  P1 · Recompilar el dist de main\n");
    expect(card).toContain("`specty memory done <id>`");
    expect(card).not.toContain("P2 ·");
    expect((await cli(root, ["memory", "done", "P1"], CLAUDE)).code).toBe(0);
    expect((await cli(root, ["next"])).out).not.toContain("RECORDATORIOS");
  });
});
