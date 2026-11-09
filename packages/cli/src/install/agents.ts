// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { NO_CHECK, withTurnEnds } from "../agents/adapter";
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
/** Devin's standalone hooks file, which Devin Desktop's agent and Devin CLI share. */
export const DEVIN_HOOKS = ".devin/hooks.v1.json";
/** Devin's shared settings, and its local ones, which hold machine paths. */
export const DEVIN_CONFIG = ".devin/config.json";
export const DEVIN_LOCAL_CONFIG = ".devin/config.local.json";

/** Files where Specty installs agent hooks; `new --worktree` copies the ones git does not track. */
export const AGENT_HOOK_FILES: readonly string[] = [
  CLAUDE_SETTINGS,
  CLAUDE_LOCAL_SETTINGS,
  CURSOR_HOOKS,
  CURSOR_SANDBOX,
  CODEX_HOOKS,
  OPENCODE_PLUGIN,
  ANTIGRAVITY_HOOKS,
  DEVIN_HOOKS,
  DEVIN_LOCAL_CONFIG,
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
 * The matcher of Specty's guard for `tool` under `event` of `hooks`, an object of events, as an
 * install left it: `doctor` compares it with the one `init` writes now.
 */
export function guardMatcher(hooks: unknown, event: string, tool: GuardTool): unknown {
  const entries = isRecord(hooks) ? hooks[event] : undefined;
  const ours = Array.isArray(entries)
    ? entries.find((entry: unknown) => isOurs(entry, tool))
    : undefined;
  return isRecord(ours) ? ours.matcher : undefined;
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
 * The JSON hook files where `check --install` puts an agent's end of turn, next to its guard.
 * OpenCode's goes inside its plugin, and Antigravity's inside its `specty` hook, which their
 * guards' removal takes whole.
 */
const STOP_FILES: readonly string[] = [
  CLAUDE_SETTINGS,
  CLAUDE_LOCAL_SETTINGS,
  CURSOR_HOOKS,
  CODEX_HOOKS,
  DEVIN_HOOKS,
];

/**
 * `value`, a hooks file of Claude Code's or Codex's form, with Specty's memory net at the end of
 * the turn (`<specty> hook memory-stop <tool>`, ADR 0016) in its `Stop`, once; without it when
 * `command` is undefined. The person's `Stop` entries stay as they were.
 */
export function withMemoryStop(value: Entry, tool: GuardTool, command: string | undefined): Entry {
  const current = stopOf(value);
  const net = (entry: unknown) => JSON.stringify(entry).includes(` hook memory-stop ${tool}"`);
  const entry = command === undefined ? undefined : { hooks: [{ type: "command", command }] };
  if (
    entry !== undefined &&
    current.some((known) => JSON.stringify(known) === JSON.stringify(entry))
  )
    return value;
  return withStop(value, [
    ...current.filter((known) => !net(known)),
    ...(entry === undefined ? [] : [entry]),
  ]);
}

/**
 * `value`, a hooks file of Claude Code's form, without the end of turn of `tool` (`hook
 * agent-stop <tool>`) in its `Stop`: `init` takes it out of the file it takes the guard out of.
 * The person's entries stay.
 */
export function withoutTurnEnd(value: Entry, tool: GuardTool): Entry {
  return withStop(
    value,
    stopOf(value).filter((entry) => !isTurnEnd(entry, tool)),
  );
}

/**
 * `value`, a hooks file of Claude Code's form where `init` now puts the guard, with the end of
 * turn of `tool` that `from`, the file it took the guard out of, had; if `value` already has one,
 * that one stays instead. Either way, the one left calls Specty with `command`, as the guard now
 * does, keeps its time limit and runs the check (no `--no-check`) when either did.
 */
export function withTurnEndFrom(
  value: Entry,
  from: unknown,
  tool: GuardTool,
  command: string,
): Entry {
  const moved = stopOf(from).filter((entry) => isTurnEnd(entry, tool));
  if (moved.length === 0) return value;
  const current = stopOf(value);
  const unchecked = ` hook agent-stop ${tool} ${NO_CHECK}`;
  const checks = [...moved, ...current].some(
    (entry) => isTurnEnd(entry, tool) && !JSON.stringify(entry).includes(unchecked),
  );
  const stop = current.some((entry) => isTurnEnd(entry, tool)) ? current : [...current, ...moved];
  return withTurnEnds(withStop(value, stop), tool, command, checks);
}

/** Whether `entry`, of a `Stop` list, is the end of turn of `tool` (`hook agent-stop <tool>`). */
function isTurnEnd(entry: unknown, tool: GuardTool): boolean {
  return JSON.stringify(entry).includes(` hook agent-stop ${tool}`);
}

/** The `Stop` list of `value`, a hooks file of Claude Code's form; empty if it has none. */
function stopOf(value: unknown): readonly unknown[] {
  const hooks = isRecord(value) && isRecord(value.hooks) ? value.hooks : {};
  return Array.isArray(hooks.Stop) ? hooks.Stop : [];
}

/** `value` with `stop` as the `Stop` of its hooks, and without `Stop` when `stop` is empty. */
function withStop(value: Entry, stop: readonly unknown[]): Entry {
  const { Stop: _, ...others } = isRecord(value.hooks) ? value.hooks : {};
  return { ...value, hooks: stop.length > 0 ? { ...others, Stop: stop } : others };
}

/** Specty's hooks at the end of an agent's turn: its own, and the memory's net (ADR 0016). */
type StopHook = "agent-stop" | "memory-stop";

/**
 * The line of `doctor` for each of `hooks` that the hooks files of `tool` (`texts`) lack, when its
 * guard is in one of them; none otherwise. Any `hook agent-stop` counts: with `--no-check`, as
 * `init` writes it, or without the mark, as `check --install` leaves it.
 */
export function stopLines(
  texts: readonly (string | undefined)[],
  tool: GuardTool,
  hooks: readonly StopHook[],
): { readonly code: StopHook; readonly tool: GuardTool }[] {
  const has = (marker: string) => texts.some((text) => text?.includes(marker) === true);
  if (!has(` guard --tool ${tool}`)) return [];
  return hooks.filter((hook) => !has(` hook ${hook} ${tool}`)).map((code) => ({ code, tool }));
}

/** Takes each agent's end of turn out of the repository, for `uninstall`. */
export async function removeAgentStops(root: string, files: InstallFiles): Promise<void> {
  for (const file of STOP_FILES) await removeFromJson(root, file, withoutAgentStop, files);
}

/**
 * Drops the entries whose command is one of Specty's ends of turn (`hook agent-stop` and the
 * memory's `hook memory-stop`), in a `hooks` object or at the top of a standalone hooks file, and
 * the lists that leaves empty; the person's stay.
 */
function withoutAgentStop(value: Entry): Entry {
  const ours = (entry: unknown) => / hook (?:agent|memory)-stop /.test(JSON.stringify(entry));
  const prune = (record: Readonly<Record<string, unknown>>): Entry =>
    Object.fromEntries(
      Object.entries(record).flatMap(([key, item]): [string, unknown][] => {
        if (!Array.isArray(item)) return [[key, item]];
        const kept = item.filter((entry: unknown) => !ours(entry));
        return kept.length === 0 && item.length > 0 ? [] : [[key, kept]];
      }),
    );
  const top = prune(value);
  return isRecord(top.hooks) ? { ...top, hooks: prune(top.hooks) } : top;
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
