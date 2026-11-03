// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo } from "./support";

/** Claude Code's hook before running `command` with its `Bash` tool in `cwd`. */
const bash = (cwd: string, command: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

describe("the guard on the memory's branch", () => {
  it("AC1: blocks an agent writing, pushing or checking out the branch with git", async () => {
    const root = await tempRepo(APP);
    for (const command of [
      "git update-ref refs/heads/specty-memory HEAD",
      "git branch -D specty-memory",
      "git push origin specty-memory",
      "git switch specty-memory",
      "git worktree add ../memoria specty-memory",
    ]) {
      const denied = await bash(root, command);
      expect(denied.code, command).toBe(2);
      expect(denied.err, command).toContain(
        "La rama `specty-memory` es la memoria de Specty: solo la escriben los comandos de `specty memory`.",
      );
      expect(denied.err, command).toContain("subir la rama es cosa de la persona");
    }
  });

  it("AC2: lets an agent read the branch, or write other branches", async () => {
    const root = await tempRepo(APP);
    for (const command of [
      "git log specty-memory",
      "git show specty-memory:README.md",
      "git branch --list",
      "git switch -c nueva",
    ]) {
      expect((await bash(root, command)).code, command).toBe(0);
    }
  });
});
