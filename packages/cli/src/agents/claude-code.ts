// SPDX-License-Identifier: Apache-2.0
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { isWorktreeEvent } from "../enforce/worktree-hooks";
import { isRecord } from "../io/files";
import { type AgentAdapter, blockingStop, exitFailed, exitReply } from "./adapter";

/** After a Bash command, whether it succeeded or failed. */
const AFTER: ReadonlySet<unknown> = new Set(["PostToolUse", "PostToolUseFailure"]);

/**
 * Claude Code (ARCHITECTURE §10): `PreToolUse`, `PostToolUse` and `PostToolUseFailure`, the
 * worktree events, `SessionStart` after a compaction, whose output it adds to the context, and
 * `Stop` at the end of each turn.
 */
export const claudeCode: AgentAdapter = {
  tool: "claude-code",
  kind: (event) => {
    if (isWorktreeEvent(event)) return "worktree";
    if (event.hook_event_name === "SessionStart") return "compact";
    return AFTER.has(event.hook_event_name) ? "after" : "before";
  },
  action,
  reply: exitReply,
  failed: exitFailed,
  card: (text) => ({ code: 0, stdout: text, stderr: "" }),
  stop: blockingStop([".claude/settings.json", ".claude/settings.local.json"]),
};

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "Edit":
    case "MultiEdit":
    case "Write":
      return { kind: "write", paths: sentPaths(input.file_path) };
    case "NotebookEdit":
      return { kind: "write", paths: sentPaths(input.notebook_path) };
    case "Bash":
      return shellAction(input.command);
    case "EnterWorktree":
      return {
        kind: "enter",
        request: {
          ...(typeof input.path === "string" ? { path: input.path } : {}),
          ...(typeof input.name === "string" ? { name: input.name } : {}),
        },
      };
    default:
      return { kind: "other" };
  }
}
