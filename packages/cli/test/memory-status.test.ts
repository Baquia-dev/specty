// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, inWorktree, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

describe("«TE TOCA» in status", () => {
  it("AC1: shows a reminder added in another folder until someone marks it done", async () => {
    const { root, folder } = await inWorktree();
    expect((await add(folder, "Recompilar el dist de main", "--kind", "reminder")).code).toBe(0);
    const card = (await cli(root, ["status"])).out;
    expect(card).toContain(
      "TE TOCA:\n  P1 · Recompilar el dist de main\n  Cuando se cumpla uno, márcalo hecho con `specty memory done <id>`.\n",
    );
    expect((await cli(folder, ["status"])).out).toContain("TE TOCA:\n  P1 · ");
    expect((await cli(root, ["memory", "done", "P1"], CLAUDE)).code).toBe(0);
    expect((await cli(root, ["status"])).out).not.toContain("TE TOCA");
  });

  it("AC2: is the card of before with no open reminder", async () => {
    const root = await tempRepo(APP);
    const before = (await cli(root, ["status"])).out;
    expect(before).not.toContain("TE TOCA");
    expect((await add(root, "Un pendiente")).code).toBe(0);
    expect((await add(root, "Una mejora", "--kind", "improvement")).code).toBe(0);
    const decided = await add(root, "Usar la rama propia", "--kind", "decision", "--quote", "sí");
    expect(decided.code).toBe(0);
    expect((await cli(root, ["status"])).out).toBe(before);
  });
});
