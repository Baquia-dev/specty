// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, read, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** Where the guard records who holds the front `name`. */
const HOLD = (name: string) => `.git/common/specty/fronts/${name}.json`;

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

/** Claude Code's `SessionEnd` when the conversation `session` ends in `cwd`, for `reason`. */
const ended = (cwd: string, session: string, reason = "clear") =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ session_id: session, cwd, hook_event_name: "SessionEnd", reason }),
  });

/** A repository whose memory has fronts B and ui: conversation s1 holds B, and s2 holds ui. */
async function withFronts(): Promise<string> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["front", "add", "B", "Guard."], CLAUDE)).code).toBe(0);
  expect((await cli(root, ["front", "add", "ui", "Pantallas."], CLAUDE)).code).toBe(0);
  expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
  expect((await bash(root, "s2", "specty front take ui")).code).toBe(0);
  return root;
}

describe("the end of a conversation", () => {
  it("AC2: frees the front it held, says nothing, and another conversation takes it at once", async () => {
    const root = await withFronts();
    expect(await ended(root, "s1")).toMatchObject({ code: 0, out: "", err: "" });
    expect(existsSync(join(root, HOLD("B")))).toBe(false);
    expect(JSON.parse(await read(root, HOLD("ui")))).toMatchObject({ conversation: "s2" });
    expect((await bash(root, "s3", "specty front take B")).code).toBe(0);
    expect(JSON.parse(await read(root, HOLD("B")))).toMatchObject({ conversation: "s3" });
  });

  it("AC2: frees it whatever the reason, and notes no step of a conversation that ends", async () => {
    const root = await withFronts();
    expect((await ended(root, "s2", "prompt_input_exit")).code).toBe(0);
    expect(existsSync(join(root, HOLD("ui")))).toBe(false);
    expect((await ended(root, "s9", "other")).code).toBe(0);
    expect(existsSync(join(root, ".git/common/specty/activity/claude-code-s9.json"))).toBe(false);
  });
});

describe("`specty enter` inside a command, out of the guard's file", () => {
  it("AC4: still tells Claude Code to enter with its own tool", async () => {
    const root = await tempRepo(APP);
    const refused = await bash(root, "s1", "specty enter 2026-x && specty next");
    expect(refused.code).toBe(2);
    expect(refused.err).toContain('usa `EnterWorktree` con `name: "2026-x"`.');
  });
});
