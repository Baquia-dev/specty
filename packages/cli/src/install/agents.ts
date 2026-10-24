// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { GuardTool } from "../enforce/actions";
import { appendLine, isRecord, readText, writeText } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";

/**
 * The Claude Code events the guard listens to, with the tools each one covers: before each
 * write or command, after each Bash command, whether it succeeded or failed, when Claude Code
 * creates or removes a worktree, which takes no matcher, and when a session starts again after a
 * compaction.
 */
const CLAUDE_EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse: "Edit|MultiEdit|Write|NotebookEdit|Bash|EnterWorktree",
  PostToolUse: "Bash",
  PostToolUseFailure: "Bash",
  WorktreeCreate: undefined,
  WorktreeRemove: undefined,
  SessionStart: "compact",
};
/** Claude Code's worktree events: with them, `EnterWorktree` by name enters the change's folder. */
export const CLAUDE_WORKTREE_EVENTS: readonly string[] = ["WorktreeCreate", "WorktreeRemove"];
/** The Codex events the guard listens to; its `matcher` is a regular expression on `tool_name`. */
const CODEX_EVENTS: Readonly<Record<string, string>> = {
  PreToolUse: "^(Bash|apply_patch)$",
  PostToolUse: "^Bash$",
};
/** Each change lives in its own worktree: the agent enters, leaves and removes it without a prompt. */
const CLAUDE_ALLOW: readonly string[] = ["EnterWorktree", "ExitWorktree"];
/** The `ask` rule an earlier `init` wrote, which made removing a worktree ask. */
const OLD_CLAUDE_ASK = "ExitWorktree(action:remove)";
const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } };
const CLAUDE_SETTINGS = ".claude/settings.json";
const CLAUDE_LOCAL_SETTINGS = ".claude/settings.local.json";
const CURSOR_HOOKS = ".cursor/hooks.json";

/** Files where Specty installs agent hooks; `new --worktree` copies the ones git does not track. */
export const AGENT_HOOK_FILES: readonly string[] = [
  CLAUDE_SETTINGS,
  CLAUDE_LOCAL_SETTINGS,
  CURSOR_HOOKS,
];

export interface AgentInstall {
  readonly file: string;
  /** True when the file holds a machine path and was excluded from git locally. */
  readonly local: boolean;
}

/**
 * Claude Code: the guard in each of its events (matcher + `hooks: [{ type: "command" }]`) and the
 * worktree permissions. Machine-specific commands go to `.claude/settings.local.json`, which is never
 * committed.
 */
export async function installClaudeCode(
  root: string,
  git: Git,
  invocation: Invocation,
): Promise<AgentInstall> {
  const target = invocation.portable ? CLAUDE_SETTINGS : CLAUDE_LOCAL_SETTINGS;
  const other = invocation.portable ? CLAUDE_LOCAL_SETTINGS : CLAUDE_SETTINGS;
  await rewriteJson(
    join(root, other),
    (value) => withHooks(value, CLAUDE_EVENTS, "claude-code", undefined),
    false,
  );
  const command = `${invocation.command} guard --tool claude-code`;
  await rewriteJson(
    join(root, target),
    (value) => withClaudePermissions(withHooks(value, CLAUDE_EVENTS, "claude-code", command)),
    true,
  );
  if (!invocation.portable) await excludeLocally(git, target);
  return { file: target, local: !invocation.portable };
}

/** Cursor: `preToolUse` (Write, Delete, Shell) and `beforeShellExecution` in `.cursor/hooks.json`. */
export async function installCursor(
  root: string,
  git: Git,
  invocation: Invocation,
): Promise<AgentInstall> {
  const file = CURSOR_HOOKS;
  const command = `${invocation.command} guard --tool cursor`;
  await rewriteJson(join(root, file), (value) => withCursorHooks(value, command), true);
  if (!invocation.portable) await excludeLocally(git, file);
  return { file, local: !invocation.portable };
}

/**
 * Codex keeps its trust in each hook by the absolute path of the hook's file, so a hook inside
 * the repository would need trusting again in every worktree. The guard goes to the user's
 * configuration instead (`$CODEX_HOME`, or `~/.codex`): trusted once, and idle outside Specty repos.
 */
export function codexHooksFile(env: NodeJS.ProcessEnv): string {
  const home = env.CODEX_HOME !== undefined && env.CODEX_HOME !== "" ? env.CODEX_HOME : undefined;
  return join(home ?? join(env.HOME ?? homedir(), ".codex"), "hooks.json");
}

/** Codex: `PreToolUse` (Bash, apply_patch) and `PostToolUse` (Bash) in its user `hooks.json`. */
export async function installCodex(
  env: NodeJS.ProcessEnv,
  invocation: Invocation,
): Promise<string> {
  const file = codexHooksFile(env);
  const command = `${invocation.command} guard --tool codex`;
  await rewriteJson(file, (value) => withHooks(value, CODEX_EVENTS, "codex", command), true);
  return file;
}

export function hasGuard(text: string | undefined, tool: GuardTool): boolean {
  return text?.includes(`guard --tool ${tool}`) === true;
}

/** Whether Claude Code's settings in `root` send `EnterWorktree` by name to the change's folder. */
export async function entersByName(root: string): Promise<boolean> {
  const missing = missingClaudeEvents([
    await readText(join(root, CLAUDE_SETTINGS)),
    await readText(join(root, CLAUDE_LOCAL_SETTINGS)),
  ]);
  return !missing.some((event) => CLAUDE_WORKTREE_EVENTS.includes(event));
}

/** The Claude Code events whose guard hook none of these settings files (their text) installs. */
export function missingClaudeEvents(settings: readonly (string | undefined)[]): string[] {
  const installed = settings.map((text): unknown => (text === undefined ? undefined : parse(text)));
  return Object.keys(CLAUDE_EVENTS).filter(
    (event) =>
      !installed.some((value) => {
        const entries = isRecord(value) && isRecord(value.hooks) ? value.hooks[event] : undefined;
        return (
          Array.isArray(entries) && entries.some((entry: unknown) => isOurs(entry, "claude-code"))
        );
      }),
  );
}

type Entry = Record<string, unknown>;

function isOurs(entry: unknown, tool: string): boolean {
  return JSON.stringify(entry).includes(`guard --tool ${tool}`);
}

/**
 * Puts the guard in each event of a `hooks` object shaped like Claude Code's (Codex uses the same
 * one), or takes it out when `command` is undefined. Other hooks stay as they were.
 */
function withHooks(
  value: Entry,
  events: Readonly<Record<string, string | undefined>>,
  tool: GuardTool,
  command: string | undefined,
): Entry {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const updated = Object.entries(events).flatMap(([event, matcher]): [string, unknown[]][] => {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    const kept = current.filter((entry: unknown) => !isOurs(entry, tool));
    const hook = { hooks: [{ type: "command", command }] };
    const ours = command === undefined ? [] : [matcher === undefined ? hook : { matcher, ...hook }];
    const entries = [...kept, ...ours];
    return entries.length === 0 && !Object.hasOwn(hooks, event) ? [] : [[event, entries]];
  });
  return { ...value, hooks: { ...hooks, ...Object.fromEntries(updated) } };
}

/**
 * Adds the worktree permissions after the rules the file already had, and drops the old `ask`
 * rule; an `ask` left empty goes too.
 */
function withClaudePermissions(value: Entry): Entry {
  const { ask, ...permissions } = isRecord(value.permissions) ? value.permissions : {};
  const current: unknown[] = Array.isArray(permissions.allow) ? permissions.allow : [];
  const allow = [...current, ...CLAUDE_ALLOW.filter((rule) => !current.includes(rule))];
  const kept: unknown = Array.isArray(ask)
    ? ask.filter((rule: unknown) => rule !== OLD_CLAUDE_ASK)
    : ask;
  const empty = kept === undefined || (Array.isArray(kept) && kept.length === 0);
  return { ...value, permissions: { ...permissions, allow, ...(empty ? {} : { ask: kept }) } };
}

function withCursorHooks(value: Entry, command: string): Entry {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const event = (name: string, entry: Entry) => {
    const current = Array.isArray(hooks[name]) ? hooks[name] : [];
    return [...current.filter((item: unknown) => !isOurs(item, "cursor")), entry];
  };
  return {
    ...value,
    version: typeof value.version === "number" ? value.version : 1,
    hooks: {
      ...hooks,
      preToolUse: event("preToolUse", { command, matcher: "Write|Delete|Shell" }),
      beforeShellExecution: event("beforeShellExecution", { command }),
    },
  };
}

/** Rewrites a JSON(C) file key by key, keeping comments and formatting elsewhere. */
async function rewriteJson(
  path: string,
  update: (value: Entry) => Entry,
  create: boolean,
): Promise<void> {
  const text = await readText(path);
  if (text === undefined && !create) return;
  const source = text ?? "{}\n";
  const parsed: unknown = parse(source);
  const before = isRecord(parsed) ? parsed : {};
  const after = update(before);
  const changed = Object.keys(after).filter(
    (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]),
  );
  if (changed.length === 0 && text !== undefined) return;
  const final = changed.reduce(
    (current, key) => applyEdits(current, modify(current, [key], after[key], FORMAT)),
    source,
  );
  await writeText(path, final.endsWith("\n") ? final : `${final}\n`);
}

/** Keeps a machine-specific file out of git without touching `.gitignore`. */
async function excludeLocally(git: Git, file: string): Promise<void> {
  if (await git.isTracked(file)) return;
  const exclude = await git.gitPath("info/exclude");
  const text = (await readText(exclude)) ?? "";
  if (!text.split("\n").includes(`/${file}`)) await appendLine(exclude, `/${file}`);
}
