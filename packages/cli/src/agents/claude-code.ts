// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  claudePermissionsLine,
  type DoctorLine,
  guardLine,
  HUMAN_COMMANDS,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { asSubagentConversation, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { isWorktreeEvent } from "../enforce/worktree-hooks";
import {
  CLAUDE_LOCAL_SETTINGS,
  CLAUDE_SETTINGS,
  CLAUDE_WORKTREE_EVENTS,
  excludeLocally,
  isOurs,
  missingEvents,
  removeFromJson,
  stopLines,
  withHooks,
  withMemoryStop,
  withoutTurnEnd,
  withTurnEndFrom,
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
  lastAssistantMessage,
  textCard,
} from "./adapter";

/**
 * The events the guard listens to, with the tools each one covers: before each write or
 * command, after each Bash command, whether it succeeded or failed, when Claude Code creates or
 * removes a worktree, which takes no matcher, and when a session starts, which brings Specty's
 * memory, and starts again after a compaction or a `/clear`, which the closing advises when the
 * session grew big, or when it resumes, which brings back its change's card; and when a session
 * ends, `/clear` included, which frees its front.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse: "Edit|MultiEdit|Write|NotebookEdit|Bash|EnterWorktree",
  PostToolUse: "Bash",
  PostToolUseFailure: "Bash",
  WorktreeCreate: undefined,
  WorktreeRemove: undefined,
  SessionStart: "startup|clear|compact|resume",
  SessionEnd: undefined,
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
 * worktree events, `SessionStart` when a session starts or resumes and after a compaction or a `/clear`,
 * whose output it adds to the context, `SessionEnd` when a session ends, and `Stop` at the end
 * of each turn.
 */
export const claudeCode: AgentAdapter = {
  tool: "claude-code",
  // A subagent sends its session's id with its own `agent_id`: it is a conversation of its own.
  normalize: asSubagentConversation,
  kind: (event) => {
    if (isWorktreeEvent(event)) return "worktree";
    if (event.hook_event_name === "SessionStart") return "compact";
    if (event.hook_event_name === "SessionEnd") return "ended";
    return AFTER.has(event.hook_event_name) ? "after" : "before";
  },
  action,
  reply: exitReply,
  failed: exitFailed,
  // Devin loads `.claude/` hooks too, and sets DEVIN_PROJECT_DIR for every hook it runs.
  borrowed: (env) => env.DEVIN_PROJECT_DIR !== undefined,
  card: textCard,
  stop: blockingStop([CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS]),
  lastMessage: lastAssistantMessage,
  // The guard in each event (matcher + `hooks: [{ type: "command" }]`) and the permissions. A
  // machine-specific command goes to `.claude/settings.local.json`, which is never committed.
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const target = local ? CLAUDE_LOCAL_SETTINGS : CLAUDE_SETTINGS;
    const other = local ? CLAUDE_SETTINGS : CLAUDE_LOCAL_SETTINGS;
    // Its end of turn goes with the guard too, with its check if it had it: never two of them.
    const before: unknown = parse((await files.read(join(root, other))) ?? "null");
    const without: JsonUpdate = (value) =>
      withoutTurnEnd(
        withMemoryStop(
          withHooks(value, EVENTS, "claude-code", undefined),
          "claude-code",
          undefined,
        ),
        "claude-code",
      );
    await rewriteJson(join(root, other), without, false, files);
    const command = `${invocation.command} guard --tool claude-code`;
    // The memory's net at the end of the turn goes with the guard (ADR 0016).
    const net = `${invocation.command} hook memory-stop claude-code`;
    const update: JsonUpdate = (value) =>
      withPermissions(
        withTurnEndFrom(
          withMemoryStop(withHooks(value, EVENTS, "claude-code", command), "claude-code", net),
          before,
          "claude-code",
          invocation.command,
        ),
      );
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
    const end = lacking(["SessionEnd"]);
    const ok: DoctorLine[] = [];
    const problems: DoctorLine[] = [];
    if (missing.length === 0) ok.push({ code: "claude-guard" });
    else if (missing.includes("PreToolUse")) problems.push({ code: "no-claude-guard" });
    else {
      if (afterBash !== "") problems.push({ code: "claude-after-bash", events: afterBash });
      if (worktrees !== "") problems.push({ code: "claude-worktrees", events: worktrees });
      if (compact !== "") problems.push({ code: "claude-compact", events: compact });
      if (end !== "") problems.push({ code: "claude-session-end", events: end });
    }
    // An install from before the card at a session's start lacks `resume` too: one `init` fixes both.
    if (missesSource(settings, "startup")) problems.push({ code: "claude-startup" });
    else if (missesSource(settings, "resume")) problems.push({ code: "claude-resume" });
    problems.push(...stopLines(settings, "claude-code", ["memory-stop", "agent-stop"]));
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
      // `specty wait` waits for the person in the background, where Bash tells when it ends.
      return shellAction(input.command, input.run_in_background === true);
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

/**
 * Whether the guard's `SessionStart` is in these settings files (their text) and none of its
 * entries runs when a session starts from `source`: an install from before the card then.
 */
function missesSource(settings: readonly (string | undefined)[], source: string): boolean {
  const ours = settings.flatMap((text): unknown[] => {
    const value: unknown = text === undefined ? undefined : parse(text);
    const hooks = isRecord(value) && isRecord(value.hooks) ? value.hooks : {};
    const entries = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
    return entries.filter((entry: unknown) => isOurs(entry, "claude-code"));
  });
  return (
    ours.length > 0 &&
    !ours.some((entry) => runsAtSessionStart(isRecord(entry) ? entry.matcher : undefined, source))
  );
}

/**
 * Whether Claude Code runs a `SessionStart` hook with `matcher` when a session starts from
 * `source` (by default, a new session): it reads the matcher as a regular expression on
 * `source`, and none, an empty one or `*` take them all.
 */
export function runsAtSessionStart(matcher: unknown, source = "startup"): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(source);
  } catch {
    // Not a regular expression: Claude Code would compare it as it is.
    return matcher === source;
  }
}
