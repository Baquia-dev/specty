// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  claudePermissionsLine,
  type DoctorLine,
  guardLine,
  HUMAN_COMMANDS,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { isWorktreeEvent } from "../enforce/worktree-hooks";
import {
  CLAUDE_LOCAL_SETTINGS,
  CLAUDE_SETTINGS,
  CLAUDE_WORKTREE_EVENTS,
  excludeLocally,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import { COMMAND } from "../session";
import {
  type AgentAdapter,
  blockingStop,
  exitFailed,
  exitReply,
  type JsonUpdate,
  textCard,
} from "./adapter";

/**
 * The events the guard listens to, with the tools each one covers: before each write or
 * command, after each Bash command, whether it succeeded or failed, when Claude Code creates or
 * removes a worktree, which takes no matcher, and when a session starts again after a compaction.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse: "Edit|MultiEdit|Write|NotebookEdit|Bash|EnterWorktree",
  PostToolUse: "Bash",
  PostToolUseFailure: "Bash",
  WorktreeCreate: undefined,
  WorktreeRemove: undefined,
  SessionStart: "compact",
};
/** After a Bash command, whether it succeeded or failed. */
const AFTER: ReadonlySet<unknown> = new Set(["PostToolUse", "PostToolUseFailure"]);
/** The person's commands, as the agent types them: Specty decides who runs them, not Claude Code. */
const PERSON_RULES: readonly string[] = [...HUMAN_COMMANDS].map(
  (name) => `Bash(${COMMAND} ${name} *)`,
);
/**
 * Each change lives in its own worktree: the agent enters, leaves and removes it without a prompt.
 * The person's commands get past auto mode's classifier, and the guard still blocks them for the
 * agent unless the person delegated them (ADR 0010).
 */
const ALLOW: readonly string[] = ["EnterWorktree", "ExitWorktree", ...PERSON_RULES];
/** The `ask` rule an earlier `init` wrote, which made removing a worktree ask. */
const OLD_ASK = "ExitWorktree(action:remove)";

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
  card: textCard,
  stop: blockingStop([CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS]),
  // The guard in each event (matcher + `hooks: [{ type: "command" }]`) and the permissions. A
  // machine-specific command goes to `.claude/settings.local.json`, which is never committed.
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const target = local ? CLAUDE_LOCAL_SETTINGS : CLAUDE_SETTINGS;
    const other = local ? CLAUDE_SETTINGS : CLAUDE_LOCAL_SETTINGS;
    const without: JsonUpdate = (value) => withHooks(value, EVENTS, "claude-code", undefined);
    await rewriteJson(join(root, other), without, false, files);
    const command = `${invocation.command} guard --tool claude-code`;
    const update: JsonUpdate = (value) =>
      withPermissions(withHooks(value, EVENTS, "claude-code", command));
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
  remove: async (root, files) => {
    const update: JsonUpdate = (value) =>
      withoutPermissions(withHooks(value, EVENTS, "claude-code", undefined));
    for (const file of [CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS]) {
      await removeFromJson(root, file, update, files);
    }
  },
  doctor: async (root) => {
    const settings = [
      await readText(join(root, CLAUDE_SETTINGS)),
      await readText(join(root, CLAUDE_LOCAL_SETTINGS)),
    ];
    const missing = missingEvents(settings, Object.keys(EVENTS), "claude-code");
    const lacking = (events: readonly string[]) =>
      missing.filter((event) => events.includes(event)).join(", ");
    const afterBash = lacking(["PostToolUse", "PostToolUseFailure"]);
    const worktrees = lacking(CLAUDE_WORKTREE_EVENTS);
    const compact = lacking(["SessionStart"]);
    const ok: DoctorLine[] = [];
    const problems: DoctorLine[] = [];
    if (missing.length === 0) ok.push({ code: "claude-guard" });
    else if (missing.includes("PreToolUse")) problems.push({ code: "no-claude-guard" });
    else {
      if (afterBash !== "") problems.push({ code: "claude-after-bash", events: afterBash });
      if (worktrees !== "") problems.push({ code: "claude-worktrees", events: worktrees });
      if (compact !== "") problems.push({ code: "claude-compact", events: compact });
    }
    if (missingPermissions(settings).length > 0) {
      problems.push({ code: "no-claude-permissions" });
    }
    return { ok, problems };
  },
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

/**
 * Adds the worktree permissions after the rules the file already had, and drops the old `ask`
 * rule; an `ask` left empty goes too.
 */
function withPermissions(value: Record<string, unknown>): Record<string, unknown> {
  const { ask, ...permissions } = isRecord(value.permissions) ? value.permissions : {};
  const current: unknown[] = Array.isArray(permissions.allow) ? permissions.allow : [];
  const allow = [...current, ...ALLOW.filter((rule) => !current.includes(rule))];
  const kept: unknown = Array.isArray(ask) ? ask.filter((rule: unknown) => rule !== OLD_ASK) : ask;
  const empty = kept === undefined || (Array.isArray(kept) && kept.length === 0);
  return { ...value, permissions: { ...permissions, allow, ...(empty ? {} : { ask: kept }) } };
}

function withoutPermissions(value: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(value.permissions) || !Array.isArray(value.permissions.allow)) return value;
  const allow = value.permissions.allow.filter((rule: unknown) => !ALLOW.includes(String(rule)));
  return { ...value, permissions: { ...value.permissions, allow } };
}

/** The rules for the person's commands that none of these settings files (their text) allows. */
function missingPermissions(settings: readonly (string | undefined)[]): string[] {
  const allowed = settings.flatMap((text): unknown[] => {
    const value: unknown = text === undefined ? undefined : parse(text);
    const permissions = isRecord(value) && isRecord(value.permissions) ? value.permissions : {};
    return Array.isArray(permissions.allow) ? permissions.allow : [];
  });
  return PERSON_RULES.filter((rule) => !allowed.includes(rule));
}
