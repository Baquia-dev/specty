// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import { appendLine, isRecord, readText, writeText } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";

const CLAUDE_MATCHER = "Edit|MultiEdit|Write|NotebookEdit|Bash";
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
 * Claude Code: a `PreToolUse` hook (matcher + `hooks: [{ type: "command" }]`). Machine-specific
 * commands go to `.claude/settings.local.json`, which is never committed.
 */
export async function installClaudeCode(
  root: string,
  git: Git,
  invocation: Invocation,
): Promise<AgentInstall> {
  const target = invocation.portable ? CLAUDE_SETTINGS : CLAUDE_LOCAL_SETTINGS;
  const other = invocation.portable ? CLAUDE_LOCAL_SETTINGS : CLAUDE_SETTINGS;
  await rewriteJson(join(root, other), (value) => withClaudeHook(value, undefined), false);
  const command = `${invocation.command} guard --tool claude-code`;
  await rewriteJson(join(root, target), (value) => withClaudeHook(value, command), true);
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

export function hasGuard(text: string | undefined, tool: "claude-code" | "cursor"): boolean {
  return text?.includes(`guard --tool ${tool}`) === true;
}

type Entry = Record<string, unknown>;

function isOurs(entry: unknown, tool: string): boolean {
  return JSON.stringify(entry).includes(`guard --tool ${tool}`);
}

function withClaudeHook(value: Entry, command: string | undefined): Entry {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const current = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const kept = current.filter((entry: unknown) => !isOurs(entry, "claude-code"));
  const ours =
    command === undefined
      ? []
      : [{ matcher: CLAUDE_MATCHER, hooks: [{ type: "command", command }] }];
  return { ...value, hooks: { ...hooks, PreToolUse: [...kept, ...ours] } };
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
