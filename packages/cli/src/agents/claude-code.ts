// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { claudePermissionsLine, guardLine } from "@baquia-dev/specty-core";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { isWorktreeEvent } from "../enforce/worktree-hooks";
import {
  CLAUDE_ALLOW,
  CLAUDE_EVENTS,
  CLAUDE_LOCAL_SETTINGS,
  CLAUDE_SETTINGS,
  excludeLocally,
  withHooks,
} from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord } from "../io/files";
import { COMMAND } from "../session";
import { type AgentAdapter, blockingStop, exitFailed, exitReply, type JsonUpdate } from "./adapter";

/** After a Bash command, whether it succeeded or failed. */
const AFTER: ReadonlySet<unknown> = new Set(["PostToolUse", "PostToolUseFailure"]);
/** The `ask` rule an earlier `init` wrote, which made removing a worktree ask. */
const OLD_CLAUDE_ASK = "ExitWorktree(action:remove)";

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
  stop: blockingStop([CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS]),
  // The guard in each event (matcher + `hooks: [{ type: "command" }]`) and the permissions. A
  // machine-specific command goes to `.claude/settings.local.json`, which is never committed.
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const target = local ? CLAUDE_LOCAL_SETTINGS : CLAUDE_SETTINGS;
    const other = local ? CLAUDE_SETTINGS : CLAUDE_LOCAL_SETTINGS;
    const without: JsonUpdate = (value) =>
      withHooks(value, CLAUDE_EVENTS, "claude-code", undefined);
    await rewriteJson(join(root, other), without, false, files);
    const command = `${invocation.command} guard --tool claude-code`;
    const update: JsonUpdate = (value) =>
      withPermissions(withHooks(value, CLAUDE_EVENTS, "claude-code", command));
    await rewriteJson(join(root, target), update, true, files);
    if (local) await excludeLocally(git, target, files);
    return {
      done: [
        guardLine("Claude Code", target, local, lang),
        claudePermissionsLine(COMMAND, target, local, lang),
      ],
      warnings: [],
      written: local ? [] : [target],
    };
  },
};

/**
 * Adds the worktree permissions after the rules the file already had, and drops the old `ask`
 * rule; an `ask` left empty goes too.
 */
function withPermissions(value: Record<string, unknown>): Record<string, unknown> {
  const { ask, ...permissions } = isRecord(value.permissions) ? value.permissions : {};
  const current: unknown[] = Array.isArray(permissions.allow) ? permissions.allow : [];
  const allow = [...current, ...CLAUDE_ALLOW.filter((rule) => !current.includes(rule))];
  const kept: unknown = Array.isArray(ask)
    ? ask.filter((rule: unknown) => rule !== OLD_CLAUDE_ASK)
    : ask;
  const empty = kept === undefined || (Array.isArray(kept) && kept.length === 0);
  return { ...value, permissions: { ...permissions, allow, ...(empty ? {} : { ask: kept }) } };
}

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
