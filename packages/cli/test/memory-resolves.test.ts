// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, read, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

/** `new` of SPEC's change in a worktree of its own, taking `ids`. */
const resolving = (root: string, title: string, ...ids: string[]) =>
  cli(root, ["new", "--worktree", title, "--resolves", ...ids]);

/** One step of a Claude Code conversation in `cwd`: a `Bash` call about to run. */
const step = (cwd: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    }),
  });

/** The open changes `status` sees from `root`. */
const openChanges = async (root: string): Promise<unknown[]> =>
  JSON.parse((await cli(root, ["--json", "status"])).out).changes;

describe("specty new --resolves", () => {
  it("AC1: takes each entry for the new change, as every folder sees", async () => {
    const root = await tempRepo(APP);
    for (const text of ["Uno", "Dos", "Tres"]) expect((await add(root, text)).code).toBe(0);
    expect((await resolving(root, "Saludo personalizado", "p1", "P3")).code).toBe(0);
    const listed = (await cli(folderOf(root), ["memory"])).out;
    expect(listed).toContain(`P1 · pendiente · tomada por ${CHANGE} · Uno`);
    expect(listed).toContain(`P3 · pendiente · tomada por ${CHANGE} · Tres`);
    expect(listed).toContain("P2 · pendiente · Dos");
    const card = (await cli(root, ["next"])).out;
    expect(card).toContain("Las primeras libres:\n  P2 · pendiente · Dos\n  No las empieces");
    const audit = await read(folderOf(root), `.specty/changes/${CHANGE}/audit.jsonl`);
    expect(JSON.parse(audit.split("\n")[0] ?? "")).toMatchObject({
      event: "change.created",
      data: { resolves: ["P1", "P3"] },
    });
  });

  it("AC2: refuses an entry another open change took, saying which, who holds it and the next free one", async () => {
    const root = await tempRepo(APP);
    for (const text of ["Uno", "Dos"]) expect((await add(root, text)).code).toBe(0);
    expect((await resolving(root, "Saludo personalizado", "P1")).code).toBe(0);
    await step(folderOf(root));
    const refused = await resolving(root, "Otro saludo", "P2", "P1");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      `P1 ya la tomó el cambio ${CHANGE} (draft, en ../${basename(root)}.worktrees/${CHANGE}, lo lleva claude-code, ahora mismo).`,
    );
    expect(refused.out).toContain(
      `pregúntale al usuario si sigue con ${CHANGE}; la siguiente libre es P2, «Dos»`,
    );
    expect(await openChanges(root)).toHaveLength(1);
    expect((await cli(root, ["memory"])).out).toContain("P2 · pendiente · Dos");
  });

  it("AC3: refuses an unknown id, a reminder, a decision or a closed entry, and creates nothing", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, "Recompilar el dist", "--kind", "reminder")).code).toBe(0);
    expect((await add(root, "Rama propia", "--kind", "decision", "--quote", "sí")).code).toBe(0);
    expect((await add(root, "Subir la rama", "--kind", "reminder")).code).toBe(0);
    expect((await cli(root, ["memory", "done", "P2"], CLAUDE)).code).toBe(0);
    const cases = [
      ["P9", "La memoria no tiene la entrada P9."],
      ["P1", "P1 es un recordatorio: `--resolves` solo toma pendientes y mejoras."],
      ["D1", "D1 es una decisión: `--resolves` solo toma pendientes y mejoras."],
      ["P2", "P2 ya está hecha: no se puede tomar."],
    ] as const;
    for (const [id, why] of cases) {
      const refused = await resolving(root, "Saludo personalizado", id);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain(why);
    }
    expect(await openChanges(root)).toHaveLength(0);
    expect(git(root, "branch", "--list", "specty/*")).toBe("");
  });
});
