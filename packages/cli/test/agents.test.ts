// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES, isAgentTool, isGuardedAgent } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { ADAPTERS } from "../src/agents";
import type { Verdict } from "../src/agents/adapter";

const allow: Verdict = { allow: true };
const deny: Verdict = {
  allow: false,
  reason: "fuera de alcance",
  text: "specty: fuera de alcance",
};

describe("each agent's module", () => {
  it("exists for every agent the capability table guards, and only for those", () => {
    const guarded = Object.keys(AGENT_CAPABILITIES).filter(isAgentTool).filter(isGuardedAgent);
    expect(Object.keys(ADAPTERS).sort()).toEqual(guarded.sort());
    for (const [tool, agent] of Object.entries(ADAPTERS)) expect(agent.tool).toBe(tool);
  });

  for (const tool of ["claude-code", "codex", "opencode"] as const) {
    it(`answers ${tool} with exit codes and stderr (AC3)`, () => {
      const agent = ADAPTERS[tool];
      for (const phase of ["before", "after"] as const) {
        expect(agent.reply(allow, phase)).toEqual({ code: 0, stdout: "", stderr: "" });
        expect(agent.reply(deny, phase)).toEqual({ code: 2, stdout: "", stderr: deny.text });
      }
      expect(agent.failed("specty guard: roto")).toEqual({
        code: 1,
        stdout: "",
        stderr: "specty guard: roto",
      });
    });
  }

  it("answers Cursor in JSON: a permission before, a context after, and allow when failing (AC3)", () => {
    const { cursor } = ADAPTERS;
    const parsed = (verdict: Verdict, phase: "before" | "after") => {
      const reply = cursor.reply(verdict, phase);
      expect([reply.code, reply.stderr]).toEqual([0, ""]);
      return JSON.parse(reply.stdout);
    };
    expect(parsed(allow, "before")).toEqual({ permission: "allow" });
    expect(parsed(deny, "before")).toEqual({
      permission: "deny",
      user_message: "specty: fuera de alcance",
      agent_message: deny.text,
    });
    expect(parsed(allow, "after")).toEqual({});
    expect(parsed(deny, "after")).toEqual({ additional_context: deny.text });
    expect(JSON.parse(cursor.failed("specty guard: roto").stdout)).toEqual({
      permission: "allow",
      user_message: "specty guard: roto",
    });
  });

  it("tells each event apart in its tool's names", () => {
    const kinds = (tool: keyof typeof ADAPTERS, names: readonly string[]) =>
      names.map((name) => ADAPTERS[tool].kind({ hook_event_name: name }));
    expect(
      kinds("claude-code", [
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "SessionStart",
        "WorktreeCreate",
        "WorktreeRemove",
      ]),
    ).toEqual(["before", "after", "after", "compact", "worktree", "worktree"]);
    expect(
      kinds("cursor", ["preToolUse", "beforeShellExecution", "postToolUse", "postToolUseFailure"]),
    ).toEqual(["before", "before", "after", "after"]);
    expect(kinds("codex", ["PreToolUse", "PostToolUse"])).toEqual(["before", "after"]);
    const codexStart = (source: string) =>
      ADAPTERS.codex.kind({ hook_event_name: "SessionStart", source });
    expect([codexStart("compact"), codexStart("startup")]).toEqual(["compact", "before"]);
    expect(ADAPTERS.opencode.kind({ tool_name: "bash" })).toBe("before");
    expect(kinds("opencode", ["PostToolUse"])).toEqual(["after"]);
  });

  it("brings the card back after a compaction where the tool reads it: Claude Code and Codex", () => {
    for (const tool of ["claude-code", "codex"] as const) {
      expect(ADAPTERS[tool].card?.("TARJETA")).toEqual({ code: 0, stdout: "TARJETA", stderr: "" });
    }
    expect([ADAPTERS.cursor.card, ADAPTERS.opencode.card]).toEqual([undefined, undefined]);
  });
});
