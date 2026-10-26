// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { antigravityTrustWarning, guardLine } from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { ANTIGRAVITY_HOOKS, excludeLocally, removeFromJson } from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import type { AgentAdapter } from "./adapter";

/** The name of Specty's hook among the person's in `.agents/hooks.json`. */
const HOOK = "specty";
/** Its tools that change the repository; there is none to delete a file. */
const TOOLS = "run_command|write_to_file|replace_file_content|multi_replace_file_content";
/**
 * The events the guard listens to, with the tools each one covers; `undefined` is an event that
 * takes a list of handlers, with no matcher.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse: TOOLS,
  PostToolUse: "run_command",
  PreInvocation: undefined,
};

/**
 * Antigravity (ARCHITECTURE §10): `PreToolUse`, `PostToolUse` and `PreInvocation` in the hook
 * `specty` of `.agents/hooks.json`, each calling the guard with `--event`, because its input does
 * not name the event. It reads JSON only and ignores exit codes; a hook that fails blocks the tool,
 * so every reply exits 0 and the guard's own failure allows. Its `PostToolUse` cannot reach the
 * model: the warning after a command waits for the next model call (`PreInvocation`).
 */
export const antigravity: AgentAdapter = {
  tool: "antigravity",
  normalize,
  kind: (event) => {
    if (event.hook_event_name === "PostToolUse") return "after";
    return event.hook_event_name === "PreInvocation" ? "invocation" : "before";
  },
  action,
  reply: (verdict, phase) => {
    if (phase === "after") return json({});
    return json(verdict.allow ? { decision: "allow" } : { decision: "deny", reason: verdict.text });
  },
  failed: () => json({ decision: "allow" }),
  late: "invocation",
  inject: (texts) =>
    json(
      texts.length === 0 ? {} : { injectSteps: texts.map((text) => ({ ephemeralMessage: text })) },
    ),
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool antigravity`;
    const update = (value: Record<string, unknown>) => ({ ...value, [HOOK]: hookOf(command) });
    await rewriteJson(join(root, ANTIGRAVITY_HOOKS), update, true, files);
    if (local) await excludeLocally(git, ANTIGRAVITY_HOOKS, files);
    return {
      done: [guardLine("Antigravity", ANTIGRAVITY_HOOKS, local, lang)],
      warnings: [antigravityTrustWarning(lang)],
      written: local ? [] : [ANTIGRAVITY_HOOKS],
    };
  },
  remove: (root, files) =>
    removeFromJson(
      root,
      ANTIGRAVITY_HOOKS,
      ({ [HOOK]: _, ...rest }: Record<string, unknown>) => rest,
      files,
    ),
  doctor: async (root) => {
    const value: unknown = parse((await readText(join(root, ANTIGRAVITY_HOOKS))) ?? "null");
    const ours = isRecord(value) && isRecord(value[HOOK]) ? value[HOOK] : {};
    const missing = Object.keys(EVENTS).filter(
      (event) => !JSON.stringify(ours[event] ?? null).includes(`--event ${event}`),
    );
    const file = ANTIGRAVITY_HOOKS;
    if (missing.includes("PreToolUse")) {
      return { ok: [], problems: [{ code: "no-antigravity-guard", file }] };
    }
    return missing.length === 0
      ? { ok: [{ code: "antigravity-guard", file }], problems: [] }
      : { ok: [], problems: [{ code: "antigravity-hooks", file, events: missing.join(", ") }] };
  },
};

/** Specty's hook: each event calls the guard with its name. */
function hookOf(command: string): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(EVENTS).map(([event, matcher]) => {
      const handler = { type: "command", command: `${command} --event ${event}`, timeout: 30 };
      return [event, matcher === undefined ? [handler] : [{ matcher, hooks: [handler] }]];
    }),
  );
}

/**
 * Its input, in the names the guard reads: the conversation is the session, a step of it the tool
 * call, and the folder the command's `Cwd` or the first of the workspace.
 */
function normalize(event: Record<string, unknown>): Record<string, unknown> {
  const call = isRecord(event.toolCall) ? event.toolCall : {};
  const args = isRecord(call.args) ? call.args : {};
  const cwd = folderOf(event, args);
  const conversation = typeof event.conversationId === "string" ? event.conversationId : undefined;
  const step = typeof event.stepIdx === "number" ? event.stepIdx : undefined;
  return {
    ...event,
    tool_name: call.name,
    tool_input: args,
    ...(conversation === undefined ? {} : { session_id: conversation }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(conversation === undefined || step === undefined
      ? {}
      : { tool_use_id: `${conversation}-${step}` }),
  };
}

/** Where a call runs: the command's `Cwd`, or else the first folder of the workspace. */
function folderOf(
  event: Readonly<Record<string, unknown>>,
  args: Readonly<Record<string, unknown>>,
): string | undefined {
  if (typeof args.Cwd === "string" && args.Cwd !== "") return args.Cwd;
  const folders: readonly unknown[] = Array.isArray(event.workspacePaths)
    ? event.workspacePaths
    : [];
  return folders.find((folder): folder is string => typeof folder === "string");
}

function json(value: Readonly<Record<string, unknown>>): GuardReply {
  return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "run_command":
      return shellAction(input.CommandLine);
    case "write_to_file":
    case "replace_file_content":
    case "multi_replace_file_content":
      return { kind: "write", paths: sentPaths(input.TargetFile) };
    default:
      return { kind: "other" };
  }
}
