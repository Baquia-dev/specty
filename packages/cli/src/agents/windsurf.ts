// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  AGENT_NAMES,
  devinRestrictedWarning,
  guardLine,
  patchPaths,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { DEVIN_HOOKS, excludeLocally, removeFromJson, withHooks } from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import { type AgentAdapter, exitFailed, exitReply, jsonStop } from "./adapter";

/**
 * The events the guard listens to, each with a regular expression on `tool_name`;
 * `PostCompaction`, with none, comes once Devin compacts.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse: "^(exec|write|edit|notebook_edit|apply_patch|write_to_process)$",
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
  reply: (verdict, phase, card) => {
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
    return {
      done: [guardLine(AGENT_NAMES.windsurf, DEVIN_HOOKS, local, lang)],
      warnings: [devinRestrictedWarning(lang)],
      written: local ? [] : [DEVIN_HOOKS],
    };
  },
  remove: (root, files) =>
    removeFromJson(root, DEVIN_HOOKS, (value) => withDevinHooks(value, undefined), files),
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

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "exec":
      return shellAction(input.command);
    // What it types into a running process, which may be a shell, is judged as a command.
    case "write_to_process":
      return shellAction(firstText(input, ["input", "chars", "text", "data"]));
    case "write":
    case "edit":
    case "notebook_edit":
      return { kind: "write", paths: sentPaths(input.file_path ?? input.path) };
    case "apply_patch": {
      const patch = firstText(input, ["input", "patch", "command"]);
      return patch === undefined ? { kind: "other" } : { kind: "files", ...patchPaths(patch) };
    }
    default:
      return { kind: "other" };
  }
}

/** The first of `keys` that holds text: the documentation does not fix these fields' names. */
function firstText(
  input: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | undefined {
  return keys.map((key) => input[key]).find((value): value is string => typeof value === "string");
}
