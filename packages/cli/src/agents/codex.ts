// SPDX-License-Identifier: Apache-2.0
import { patchPaths } from "@baquia-dev/specty-core";
import type { RawAction } from "../enforce/actions";
import { isRecord } from "../io/files";
import { type AgentAdapter, exitFailed, exitReply } from "./adapter";

/**
 * Codex (ARCHITECTURE §10): `PreToolUse` with `Bash` and `apply_patch`, and `PostToolUse` with
 * `Bash`, which also comes after a command that failed. It reads exit 2 as Claude Code does.
 */
export const codex: AgentAdapter = {
  tool: "codex",
  kind: (event) => (event.hook_event_name === "PostToolUse" ? "after" : "before"),
  action,
  reply: exitReply,
  failed: exitFailed,
};

/** Codex sends a command and a patch alike in `tool_input.command`. */
function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  if (typeof input.command !== "string") return { kind: "other" };
  switch (event.tool_name) {
    case "Bash":
      return { kind: "shell", command: input.command };
    case "apply_patch":
      return { kind: "files", ...patchPaths(input.command) };
    default:
      return { kind: "other" };
  }
}
