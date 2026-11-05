// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo } from "./support";

/** An agent that Specty recognizes, to write the memory. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** Codex running a command in its thread `session`, which it tells in the command's environment. */
const inThread = (session: string) => ({ env: { CODEX_THREAD_ID: session } });

/** Codex's hook before the thread `session` runs `command` in `cwd`. */
const bash = (cwd: string, session: string, command: string) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

/** Codex's `SessionStart` when the thread `session` starts in `cwd`. */
const started = (cwd: string, session: string) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({
      session_id: session,
      cwd,
      hook_event_name: "SessionStart",
      source: "startup",
    }),
  });

/** A repository whose memory has P1 to P5, and front B with P4 and P2 in that order. */
async function withFront(): Promise<string> {
  const root = await tempRepo(APP);
  const run = (...args: string[]) => cli(root, args, CLAUDE);
  for (const text of ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]) {
    expect((await run("memory", "add", text)).code).toBe(0);
  }
  expect((await run("front", "add", "B", "Guard.")).code).toBe(0);
  expect((await run("front", "assign", "B", "P4", "P2")).code).toBe(0);
  return root;
}

/** The lines of `text` under «MEMORIA DE SPECTY», up to the next section or SIGUIENTE. */
const memoryOf = (text: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf("MEMORIA DE SPECTY:");
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

describe("the card with no active change in a Codex thread that holds a front", () => {
  it("AC1: shows the thread that took a front only that front's free entries, in order", async () => {
    const root = await withFront();
    expect((await bash(root, "t1", "specty front take B")).code).toBe(0);
    const next = await cli(root, ["next"], inThread("t1"));
    expect(memoryOf(next.out).slice(0, 3)).toEqual([
      "Pendientes y mejoras abiertas: 5. Las primeras libres de tu frente, B, en su orden:",
      "P4 · pendiente · Cuatro",
      "P2 · pendiente · Dos",
    ]);
    for (const outside of ["P1", "P3", "P5"]) expect(next.out).not.toContain(`${outside} ·`);
    // The guard knows the thread by its event, as when the session starts.
    expect((await started(root, "t1")).out).toBe(next.out);
  });

  it("AC2: leaves that front's entries out for another Codex thread", async () => {
    const root = await withFront();
    expect((await bash(root, "t1", "specty front take B")).code).toBe(0);
    const other = await cli(root, ["next"], inThread("t2"));
    expect(memoryOf(other.out).slice(0, 4)).toEqual([
      "Pendientes y mejoras abiertas: 5. Las primeras libres:",
      "P1 · pendiente · Uno",
      "P3 · pendiente · Tres",
      "P5 · pendiente · Cinco",
    ]);
    expect((await started(root, "t2")).out).toBe(other.out);
  });
});
