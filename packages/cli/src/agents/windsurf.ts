// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import {
  AGENT_NAMES,
  devinCommandsLine,
  devinRestrictedWarning,
  devinSandboxLine,
  devinSandboxTrackedWarning,
  guardLine,
  type Lang,
  movePatch,
  patchPaths,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { sharedFolders, worktreesHome } from "../flow/worktree";
import {
  DEVIN_CONFIG,
  DEVIN_HOOKS,
  DEVIN_LOCAL_CONFIG,
  excludeLocally,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { type InstallFiles, rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import { COMMAND } from "../session";
import { type AgentAdapter, exitFailed, exitReply, jsonStop, type Redirect } from "./adapter";

/** Devin's rule for Specty's commands, by the name the agent types them with. */
const RUN = `Exec(${COMMAND})`;

/**
 * The events the guard listens to, each with a regular expression on `tool_name`;
 * `PostCompaction`, with none, comes once Devin compacts.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse:
    "^(exec|write|edit|notebook_edit|apply_patch|write_to_process|read|notebook_read|grep|glob)$",
  PostToolUse: "^exec$",
  PostCompaction: undefined,
};

/**
 * Windsurf is Devin Desktop now (ARCHITECTURE §10): since 3.9.19 its only agent, Devin Local,
 * shares Devin CLI's hooks, shaped as Claude Code's, in the standalone `.devin/hooks.v1.json`, so
 * this module serves both. Before an action it reads exit 2 as Claude Code does; after a command,
 * the warning goes to the context (`additionalContext`). Its `PostCompaction` is not said to add
 * anything, so the card waits for the next command, as Cursor's does. Cascade, its agent until
 * 3.9.18, had other hooks, and is left out.
 */
export const windsurf: AgentAdapter = {
  tool: "windsurf",
  normalize,
  kind: (event) => {
    if (event.hook_event_name === "PostToolUse") return "after";
    return event.hook_event_name === "PostCompaction" ? "compacting" : "before";
  },
  action,
  redirect,
  reply: (verdict, phase, card) => {
    if (phase === "before" && verdict.allow && verdict.input !== undefined) {
      // Devin merges these fields into the tool's arguments before it runs.
      const output = {
        hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: verdict.input },
      };
      return { code: 0, stdout: JSON.stringify(output), stderr: "" };
    }
    if (phase === "before") return exitReply(verdict);
    const texts = [...(verdict.allow ? [] : [verdict.text]), ...(card === undefined ? [] : [card])];
    if (texts.length === 0) return exitReply({ allow: true });
    const output = {
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: texts.join("\n\n") },
    };
    return { code: 0, stdout: JSON.stringify(output), stderr: "" };
  },
  failed: exitFailed,
  // Claude Code's end of turn, at the top of the standalone hooks file.
  stop: {
    acts: (event) => event.stop_hook_active !== true,
    reply: (message) => JSON.stringify({ decision: "block", reason: message }),
    plan: jsonStop([DEVIN_HOOKS], (command, timeout) => (value) => {
      const current: unknown[] = Array.isArray(value.Stop) ? value.Stop : [];
      const entry = { hooks: [{ type: "command", command, timeout }] };
      return { ...value, Stop: [...current, entry] };
    }),
  },
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool windsurf`;
    const update = (value: Record<string, unknown>) => withDevinHooks(value, command);
    await rewriteJson(join(root, DEVIN_HOOKS), update, true, files);
    if (local) await excludeLocally(git, DEVIN_HOOKS, files);
    const permissions = await installPermissions(root, git, files, lang);
    return {
      done: [guardLine(AGENT_NAMES.windsurf, DEVIN_HOOKS, local, lang), ...permissions.done],
      warnings: [devinRestrictedWarning(lang), ...permissions.warnings],
      written: [...(local ? [] : [DEVIN_HOOKS]), DEVIN_CONFIG],
    };
  },
  remove: async (root, files, git) => {
    await removeFromJson(root, DEVIN_HOOKS, (value) => withDevinHooks(value, undefined), files);
    await removeFromJson(root, DEVIN_CONFIG, (value) => withAllowed(value, [RUN], false), files);
    const scopes = await writeScopes(git);
    await removeFromJson(
      root,
      DEVIN_LOCAL_CONFIG,
      (value) => withAllowed(value, scopes, false),
      files,
    );
  },
  doctor: async (root) => {
    const value: unknown = parse((await readText(join(root, DEVIN_HOOKS))) ?? "null");
    const hooks = isRecord(value) ? value : {};
    const missing = Object.keys(EVENTS).filter(
      (event) => !JSON.stringify(hooks[event] ?? null).includes("guard --tool windsurf"),
    );
    const file = DEVIN_HOOKS;
    if (missing.includes("PreToolUse")) {
      return { ok: [], problems: [{ code: "no-windsurf-guard", file }] };
    }
    return missing.length === 0
      ? { ok: [{ code: "windsurf-guard", file }], problems: [] }
      : { ok: [], problems: [{ code: "windsurf-hooks", file, events: missing.join(", ") }] };
  },
};

/**
 * Devin's permissions for Specty: its commands run without asking (`Exec(specty)`), in the shared
 * settings like Codex's rule, and its sandbox writes in Specty's folders (`Write(...)`), in the
 * local ones, since they are machine paths. Local settings the person keeps in git stay as they
 * are, and `init` says what to add.
 */
async function installPermissions(
  root: string,
  git: Git,
  files: InstallFiles,
  lang: Lang,
): Promise<{ readonly done: readonly string[]; readonly warnings: readonly string[] }> {
  const allow = (rules: readonly string[]) => (value: Record<string, unknown>) =>
    withAllowed(value, rules, true);
  await rewriteJson(join(root, DEVIN_CONFIG), allow([RUN]), true, files);
  const commands = devinCommandsLine(DEVIN_CONFIG, lang);
  const scopes = await writeScopes(git);
  if (await git.isTracked(DEVIN_LOCAL_CONFIG)) {
    return {
      done: [commands],
      warnings: [devinSandboxTrackedWarning(DEVIN_LOCAL_CONFIG, scopes, lang)],
    };
  }
  await rewriteJson(join(root, DEVIN_LOCAL_CONFIG), allow(scopes), true, files);
  await excludeLocally(git, DEVIN_LOCAL_CONFIG, files);
  return { done: [commands, devinSandboxLine(DEVIN_LOCAL_CONFIG, lang)], warnings: [] };
}

/**
 * Specty's folders as Devin's `Write(...)` scopes, which also widen its sandbox, and the
 * worktrees' folder as a `Read(...)` one, for a session that entered a change's folder there.
 */
async function writeScopes(git: Git): Promise<string[]> {
  const writes = (await sharedFolders(git)).map((folder) => `Write(${folder}/**)`);
  return [...writes, `Read(${await worktreesHome(git)}/**)`];
}

/** `rules` in `permissions.allow`, after the person's ones, or taken out of it. */
function withAllowed(
  value: Record<string, unknown>,
  rules: readonly string[],
  add: boolean,
): Record<string, unknown> {
  const permissions = isRecord(value.permissions) ? value.permissions : {};
  const current: unknown[] = Array.isArray(permissions.allow) ? permissions.allow : [];
  const kept = current.filter((rule) => typeof rule !== "string" || !rules.includes(rule));
  return { ...value, permissions: { ...permissions, allow: add ? [...kept, ...rules] : kept } };
}

/**
 * Devin's standalone hooks file holds the events at its top, shaped as Claude Code's `hooks`: the
 * guard goes in each of them, or comes out when `command` is undefined, leaving none of its
 * events empty.
 */
function withDevinHooks(
  value: Record<string, unknown>,
  command: string | undefined,
): Record<string, unknown> {
  const updated = withHooks({ hooks: value }, EVENTS, "windsurf", command).hooks;
  const hooks = isRecord(updated) ? updated : value;
  return Object.fromEntries(
    Object.entries(hooks).filter(
      ([event, entries]) => !(event in EVENTS && Array.isArray(entries) && entries.length === 0),
    ),
  );
}

/**
 * Its input already uses Claude Code's names. Without `tool_use_id`, which the documentation does
 * not promise, a tool call is known by its session and its input, the same before and after it.
 */
function normalize(event: Record<string, unknown>): Record<string, unknown> {
  if (typeof event.tool_use_id === "string" && event.tool_use_id !== "") return event;
  if (typeof event.session_id !== "string") return event;
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const call = createHash("sha256")
    .update(`${String(event.tool_name)}\n${JSON.stringify(input)}`)
    .digest("hex")
    .slice(0, 16);
  return { ...event, tool_use_id: `${event.session_id}-${call}` };
}

/** Its tools that write a file, and those that read or search, by the action each one is. */
const FILE_TOOLS: Readonly<Record<string, "write" | "read">> = {
  write: "write",
  edit: "write",
  notebook_edit: "write",
  read: "read",
  notebook_read: "read",
  grep: "read",
  glob: "read",
};

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const files = FILE_TOOLS[String(event.tool_name)];
  if (files !== undefined) return { kind: files, paths: sentPaths(input.file_path ?? input.path) };
  switch (event.tool_name) {
    case "exec":
      return shellAction(input.command);
    // What it types into a running process, which may be a shell, is judged as a command.
    case "write_to_process":
      return shellAction(firstText(input, ["input", "chars", "text", "data"]));
    case "apply_patch": {
      const patch = firstText(input, ["input", "patch", "command"]);
      return patch === undefined ? { kind: "other" } : { kind: "files", ...patchPaths(patch) };
    }
    default:
      return { kind: "other" };
  }
}

/**
 * The tool's input in the conversation's folder: a `cd` to it before a command, when the
 * conversation works in another one, and its files, folders and patch's paths there. Devin's
 * documentation names only `command` (`exec`); for the others, the fields the guard reads.
 */
function redirect(
  event: Readonly<Record<string, unknown>>,
  to: Redirect,
): Record<string, unknown> | undefined {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const base = typeof event.cwd === "string" ? event.cwd : "";
  if (event.tool_name === "exec") {
    if (typeof input.command !== "string" || to.folder === base) return undefined;
    const folder = to.folder.replaceAll("'", `'\\''`);
    return { ...input, command: `cd '${folder}' && ${input.command}` };
  }
  const moved = movedPaths(String(event.tool_name), input, (path) => {
    const there = to.path(resolve(base, path));
    return there === resolve(base, path) ? path : there;
  });
  return Object.keys(moved).some((key) => moved[key] !== input[key]) ? moved : undefined;
}

/** The input with its file or folder, and a patch's paths, as `move` gives them. */
function movedPaths(
  tool: string,
  input: Record<string, unknown>,
  move: (path: string) => string,
): Record<string, unknown> {
  const moved: Record<string, unknown> = { ...input };
  for (const key of ["file_path", "path"]) {
    const value = input[key];
    if (typeof value === "string" && value !== "") moved[key] = move(value);
  }
  if (tool !== "apply_patch") return moved;
  for (const key of ["input", "patch", "command"]) {
    const value = input[key];
    if (typeof value === "string") moved[key] = movePatch(value, move);
  }
  return moved;
}

/** The first of `keys` that holds text: the documentation does not fix these fields' names. */
function firstText(
  input: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | undefined {
  return keys.map((key) => input[key]).find((value): value is string => typeof value === "string");
}
