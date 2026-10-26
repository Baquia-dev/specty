// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import { HUMAN_COMMANDS } from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import type { GuardTool } from "../enforce/actions";
import { isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import { COMMAND, type Invocation } from "../session";
import { type InstallFiles, installFiles, rewriteJson } from "./files";

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
/**
 * The Cursor events the guard listens to, with the tools each one covers: before each write,
 * delete or command, and after each command, whether it succeeded or failed.
 */
const CURSOR_EVENTS: Readonly<Record<string, string | undefined>> = {
  preToolUse: "Write|Delete|Shell",
  beforeShellExecution: undefined,
  postToolUse: "Shell",
  postToolUseFailure: "Shell",
};
/** Claude Code's worktree events: with them, `EnterWorktree` by name enters the change's folder. */
export const CLAUDE_WORKTREE_EVENTS: readonly string[] = ["WorktreeCreate", "WorktreeRemove"];
/** The Codex events the guard listens to; its `matcher` is a regular expression on `tool_name`. */
const CODEX_EVENTS: Readonly<Record<string, string>> = {
  PreToolUse: "^(Bash|apply_patch)$",
  PostToolUse: "^Bash$",
};
/** The person's commands, as the agent types them: Specty decides who runs them, not Claude Code. */
const CLAUDE_PERSON_RULES: readonly string[] = [...HUMAN_COMMANDS].map(
  (name) => `Bash(${COMMAND} ${name} *)`,
);
/**
 * Each change lives in its own worktree: the agent enters, leaves and removes it without a prompt.
 * The person's commands get past auto mode's classifier, and the guard still blocks them for the
 * agent unless the person delegated them (ADR 0010).
 */
const CLAUDE_ALLOW: readonly string[] = ["EnterWorktree", "ExitWorktree", ...CLAUDE_PERSON_RULES];
/** The `ask` rule an earlier `init` wrote, which made removing a worktree ask. */
const OLD_CLAUDE_ASK = "ExitWorktree(action:remove)";
const CLAUDE_SETTINGS = ".claude/settings.json";
const CLAUDE_LOCAL_SETTINGS = ".claude/settings.local.json";
const CURSOR_HOOKS = ".cursor/hooks.json";
export const CODEX_HOOKS = ".codex/hooks.json";
export const CODEX_RULES = ".codex/rules/specty.rules";
/**
 * Codex's execpolicy rule for Specty's commands: an `allow` skips the approval and runs the
 * command outside the sandbox, which keeps `.git` read-only and so stopped every Specty commit.
 * It names the command as the agent types it, so it is versioned even when the hooks are local.
 */
const CODEX_RULE = [
  "# Specty's commands run without asking and outside Codex's sandbox: they commit to git, which",
  "# the sandbox keeps read-only. Specty itself decides who runs each one (its guard, a real",
  "# terminal or delegated mode). `specty init` writes this file and rewrites it.",
  "prefix_rule(",
  `    pattern = [${JSON.stringify(COMMAND)}],`,
  '    decision = "allow",',
  '    justification = "Specty decides who runs its commands; they commit to git, which the sandbox keeps read-only.",',
  ")",
  "",
].join("\n");
export const OPENCODE_PLUGIN = ".opencode/plugins/specty.js";

/** Files where Specty installs agent hooks; `new --worktree` copies the ones git does not track. */
export const AGENT_HOOK_FILES: readonly string[] = [
  CLAUDE_SETTINGS,
  CLAUDE_LOCAL_SETTINGS,
  CURSOR_HOOKS,
  CODEX_HOOKS,
  OPENCODE_PLUGIN,
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
  files: InstallFiles = installFiles(),
): Promise<AgentInstall> {
  const target = invocation.portable ? CLAUDE_SETTINGS : CLAUDE_LOCAL_SETTINGS;
  const other = invocation.portable ? CLAUDE_LOCAL_SETTINGS : CLAUDE_SETTINGS;
  await rewriteJson(
    join(root, other),
    (value) => withHooks(value, CLAUDE_EVENTS, "claude-code", undefined),
    false,
    files,
  );
  const command = `${invocation.command} guard --tool claude-code`;
  await rewriteJson(
    join(root, target),
    (value) => withClaudePermissions(withHooks(value, CLAUDE_EVENTS, "claude-code", command)),
    true,
    files,
  );
  if (!invocation.portable) await excludeLocally(git, target, files);
  return { file: target, local: !invocation.portable };
}

/**
 * Cursor: `preToolUse` (Write, Delete, Shell), `beforeShellExecution`, and `postToolUse` and
 * `postToolUseFailure` (Shell) in `.cursor/hooks.json`.
 */
export async function installCursor(
  root: string,
  git: Git,
  invocation: Invocation,
  files: InstallFiles = installFiles(),
): Promise<AgentInstall> {
  const file = CURSOR_HOOKS;
  const command = `${invocation.command} guard --tool cursor`;
  await rewriteJson(join(root, file), (value) => withCursorHooks(value, command), true, files);
  if (!invocation.portable) await excludeLocally(git, file, files);
  return { file, local: !invocation.portable };
}

/**
 * Codex's user hooks file (`$CODEX_HOME`, or `~/.codex`), which Specty only reads: its guard goes
 * in the project (ADR 0013).
 */
export function codexHooksFile(env: NodeJS.ProcessEnv): string {
  const home = env.CODEX_HOME !== undefined && env.CODEX_HOME !== "" ? env.CODEX_HOME : undefined;
  return join(home ?? join(env.HOME ?? homedir(), ".codex"), "hooks.json");
}

/**
 * Takes Specty's hooks and worktree permissions out of Claude Code's, Cursor's and Codex's files
 * in the repository, leaving everything else; a file left with nothing else goes, and so does
 * Specty's OpenCode plugin.
 */
export async function removeAgentHooks(root: string, files: InstallFiles): Promise<void> {
  const claude = (value: Entry) =>
    withoutEmpty(
      withoutClaudePermissions(withHooks(value, CLAUDE_EVENTS, "claude-code", undefined)),
    );
  for (const file of [CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS]) {
    await rewriteJson(join(root, file), claude, false, files);
  }
  const cursor = (value: Entry) =>
    withoutEmpty(withHooks(value, CURSOR_EVENTS, "cursor", undefined));
  await rewriteJson(join(root, CURSOR_HOOKS), cursor, false, files);
  const codex = (value: Entry) => withoutEmpty(withHooks(value, CODEX_EVENTS, "codex", undefined));
  await rewriteJson(join(root, CODEX_HOOKS), codex, false, files);
  for (const file of [CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS, CURSOR_HOOKS, CODEX_HOOKS]) {
    const value: unknown = parse((await files.read(join(root, file))) ?? "null");
    const left = isRecord(value) ? Object.keys(value).filter((key) => key !== "version") : [];
    if (isRecord(value) && left.length === 0) await files.remove(join(root, file));
  }
  const plugin = join(root, OPENCODE_PLUGIN);
  if (hasGuard(await files.read(plugin), "opencode")) await files.remove(plugin);
}

/**
 * Codex: `PreToolUse` (Bash, apply_patch) and `PostToolUse` (Bash) in the project's
 * `.codex/hooks.json`, and the rule for Specty's commands in `rules`. Codex 0.131 or later reads a
 * linked worktree's project hooks from the main checkout, so the person trusts them once per
 * repository.
 */
export async function installCodex(
  root: string,
  git: Git,
  invocation: Invocation,
  files: InstallFiles = installFiles(),
): Promise<AgentInstall & { readonly rules: string }> {
  const command = `${invocation.command} guard --tool codex`;
  const update = (value: Entry) => withHooks(value, CODEX_EVENTS, "codex", command);
  await rewriteJson(join(root, CODEX_HOOKS), update, true, files);
  if (!invocation.portable) await excludeLocally(git, CODEX_HOOKS, files);
  await files.write(join(root, CODEX_RULES), CODEX_RULE);
  return { file: CODEX_HOOKS, local: !invocation.portable, rules: CODEX_RULES };
}

/** Whether `text`, a rules file, is Specty's rule for its commands. */
export function isCodexRule(text: string | undefined): boolean {
  return text?.includes(`pattern = [${JSON.stringify(COMMAND)}]`) === true;
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

/** The Cursor events whose guard hook `.cursor/hooks.json` (its text) lacks. */
export function missingCursorEvents(text: string | undefined): string[] {
  const value: unknown = text === undefined ? undefined : parse(text);
  const hooks = isRecord(value) && isRecord(value.hooks) ? value.hooks : {};
  return Object.keys(CURSOR_EVENTS).filter((event) => {
    const entries = hooks[event];
    return !(Array.isArray(entries) && entries.some((entry: unknown) => isOurs(entry, "cursor")));
  });
}

/** The rules for the person's commands that none of these settings files (their text) allows. */
export function missingClaudePermissions(settings: readonly (string | undefined)[]): string[] {
  const allowed = settings.flatMap((text): unknown[] => {
    const value: unknown = text === undefined ? undefined : parse(text);
    const permissions = isRecord(value) && isRecord(value.permissions) ? value.permissions : {};
    return Array.isArray(permissions.allow) ? permissions.allow : [];
  });
  return CLAUDE_PERSON_RULES.filter((rule) => !allowed.includes(rule));
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

function withoutClaudePermissions(value: Entry): Entry {
  if (!isRecord(value.permissions) || !Array.isArray(value.permissions.allow)) return value;
  const allow = value.permissions.allow.filter(
    (rule: unknown) => !CLAUDE_ALLOW.includes(String(rule)),
  );
  return { ...value, permissions: { ...value.permissions, allow } };
}

/** Drops the hook lists and permissions that were left empty, and their objects if empty too. */
function withoutEmpty(value: Entry): Entry {
  const prune = (entry: unknown) =>
    isRecord(entry)
      ? Object.fromEntries(
          Object.entries(entry).filter(([, item]) => !(Array.isArray(item) && item.length === 0)),
        )
      : entry;
  const { hooks, permissions, ...rest } = value;
  const kept = Object.entries({ hooks: prune(hooks), permissions: prune(permissions) }).filter(
    ([, item]) => item !== undefined && !(isRecord(item) && Object.keys(item).length === 0),
  );
  return { ...rest, ...Object.fromEntries(kept) };
}

function withCursorHooks(value: Entry, command: string): Entry {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const updated = Object.entries(CURSOR_EVENTS).map(([name, matcher]) => {
    const current = Array.isArray(hooks[name]) ? hooks[name] : [];
    const entry = matcher === undefined ? { command } : { command, matcher };
    return [name, [...current.filter((item: unknown) => !isOurs(item, "cursor")), entry]];
  });
  return {
    ...value,
    version: typeof value.version === "number" ? value.version : 1,
    hooks: { ...hooks, ...Object.fromEntries(updated) },
  };
}

/** Keeps a machine-specific file out of git without touching `.gitignore`. */
export async function excludeLocally(git: Git, file: string, files: InstallFiles): Promise<void> {
  if (await git.isTracked(file)) return;
  const exclude = await git.gitPath("info/exclude");
  const text = (await files.read(exclude)) ?? "";
  if (!text.split("\n").includes(`/${file}`)) await files.write(exclude, `${text}/${file}\n`);
}
