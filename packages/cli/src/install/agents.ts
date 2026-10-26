// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import type { GuardTool } from "../enforce/actions";
import { isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import { type InstallFiles, rewriteJson } from "./files";

/** Claude Code's worktree events: with them, `EnterWorktree` by name enters the change's folder. */
export const CLAUDE_WORKTREE_EVENTS: readonly string[] = ["WorktreeCreate", "WorktreeRemove"];
export const CLAUDE_SETTINGS = ".claude/settings.json";
export const CLAUDE_LOCAL_SETTINGS = ".claude/settings.local.json";
export const CURSOR_HOOKS = ".cursor/hooks.json";
/** Cursor's sandbox settings for the workspace: Specty's folders in it carry machine paths. */
export const CURSOR_SANDBOX = ".cursor/sandbox.json";
export const CODEX_HOOKS = ".codex/hooks.json";
export const CODEX_RULES = ".codex/rules/specty.rules";
export const OPENCODE_PLUGIN = ".opencode/plugins/specty.js";
export const ANTIGRAVITY_HOOKS = ".agents/hooks.json";
export const GEMINI_SETTINGS = ".gemini/settings.json";

/** Files where Specty installs agent hooks; `new --worktree` copies the ones git does not track. */
export const AGENT_HOOK_FILES: readonly string[] = [
  CLAUDE_SETTINGS,
  CLAUDE_LOCAL_SETTINGS,
  CURSOR_HOOKS,
  CURSOR_SANDBOX,
  CODEX_HOOKS,
  OPENCODE_PLUGIN,
  ANTIGRAVITY_HOOKS,
  GEMINI_SETTINGS,
];

export interface AgentInstall {
  readonly file: string;
  /** True when the file holds a machine path and was excluded from git locally. */
  readonly local: boolean;
}

/**
 * Codex's user hooks file (`$CODEX_HOME`, or `~/.codex`), which Specty only reads: its guard goes
 * in the project (ADR 0013).
 */
export function codexHooksFile(env: NodeJS.ProcessEnv): string {
  const home = env.CODEX_HOME !== undefined && env.CODEX_HOME !== "" ? env.CODEX_HOME : undefined;
  return join(home ?? join(env.HOME ?? homedir(), ".codex"), "hooks.json");
}

export function hasGuard(text: string | undefined, tool: GuardTool): boolean {
  return text?.includes(`guard --tool ${tool}`) === true;
}

/** Whether Claude Code's settings in `root` send `EnterWorktree` by name to the change's folder. */
export async function entersByName(root: string): Promise<boolean> {
  const settings = [
    await readText(join(root, CLAUDE_SETTINGS)),
    await readText(join(root, CLAUDE_LOCAL_SETTINGS)),
  ];
  return missingEvents(settings, CLAUDE_WORKTREE_EVENTS, "claude-code").length === 0;
}

/** The events whose guard hook for `tool` none of these hook files (their text) has. */
export function missingEvents(
  texts: readonly (string | undefined)[],
  events: readonly string[],
  tool: GuardTool,
): string[] {
  const installed = texts.map((text): unknown => (text === undefined ? undefined : parse(text)));
  return events.filter(
    (event) =>
      !installed.some((value) => {
        const entries = isRecord(value) && isRecord(value.hooks) ? value.hooks[event] : undefined;
        return Array.isArray(entries) && entries.some((entry: unknown) => isOurs(entry, tool));
      }),
  );
}

type Entry = Record<string, unknown>;

/** Whether a hook entry is Specty's guard for `tool`. */
export function isOurs(entry: unknown, tool: string): boolean {
  return JSON.stringify(entry).includes(`guard --tool ${tool}`);
}

/**
 * Puts the guard in each event of a `hooks` object shaped like Claude Code's (Codex uses the same
 * one), or takes it out when `command` is undefined. Other hooks stay as they were.
 */
export function withHooks(
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
 * Takes Specty's part out of a JSON file in the repository with `update`, and drops what that
 * left empty; a file left with nothing else goes.
 */
export async function removeFromJson(
  root: string,
  file: string,
  update: (value: Entry) => Entry,
  files: InstallFiles,
): Promise<void> {
  const path = join(root, file);
  await rewriteJson(path, (value) => withoutEmpty(update(value)), false, files);
  const value: unknown = parse((await files.read(path)) ?? "null");
  const left = isRecord(value) ? Object.keys(value).filter((key) => key !== "version") : [];
  if (isRecord(value) && left.length === 0) await files.remove(path);
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

/** Keeps a machine-specific file out of git without touching `.gitignore`. */
export async function excludeLocally(git: Git, file: string, files: InstallFiles): Promise<void> {
  if (await git.isTracked(file)) return;
  const exclude = await git.gitPath("info/exclude");
  const text = (await files.read(exclude)) ?? "";
  if (!text.split("\n").includes(`/${file}`)) await files.write(exclude, `${text}/${file}\n`);
}
