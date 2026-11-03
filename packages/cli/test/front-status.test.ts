// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** Claude Code's hook before the conversation `session` runs `command` in `cwd`. */
const bash = (cwd: string, session: string, command: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

/** A repository whose memory has P1 to P3, and with `fronts`, front B with P3 and P1, and ui. */
async function repo(fronts: boolean): Promise<string> {
  const root = await tempRepo(APP);
  const run = (...args: string[]) => cli(root, args, CLAUDE);
  for (const text of ["Uno", "Dos", "Tres"])
    expect((await run("memory", "add", text)).code).toBe(0);
  if (!fronts) return root;
  expect((await run("front", "add", "B", "Guard.")).code).toBe(0);
  expect((await run("front", "add", "ui", "Servidor y UI.")).code).toBe(0);
  expect((await run("front", "assign", "B", "P3", "P1")).code).toBe(0);
  return root;
}

describe("the fronts in `specty status`", () => {
  it("AC5: shows each front with its owner, or free, and its open entries in order", async () => {
    const root = await repo(true);
    expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
    expect((await cli(root, ["status"])).out).toContain(
      "FRENTES:\n  B · lo lleva claude-code, ahora mismo · abiertas: P3, P1\n  ui · libre · sin entradas abiertas\n",
    );
  });

  it("AC5: has no section of fronts without them", async () => {
    expect((await cli(await repo(false), ["status"])).out).not.toContain("FRENTES");
  });

  it("AC6: carries the fronts in its --json, with the live owner of each", async () => {
    const root = await repo(true);
    expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
    const status = JSON.parse((await cli(root, ["--json", "status"])).out);
    expect(status.fronts).toEqual([
      { name: "B", open: ["P3", "P1"], owner: { tool: "claude-code", ago: 0 } },
      { name: "ui", open: [] },
    ]);
    const without = JSON.parse((await cli(await repo(false), ["--json", "status"])).out);
    expect(without.fronts).toEqual([]);
  });
});
