// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { guardLine } from "@baquia-dev/specty-core";
import { type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import {
  CURSOR_HOOKS,
  excludeLocally,
  isOurs,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import { type AgentAdapter, doctorLines } from "./adapter";

/**
 * The events the guard listens to, with the tools each one covers: before each write, delete or
 * command, and after each command, whether it succeeded or failed.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  preToolUse: "Write|Delete|Shell",
  beforeShellExecution: undefined,
  postToolUse: "Shell",
  postToolUseFailure: "Shell",
};
/** After a command, whether it succeeded or failed. */
const AFTER: ReadonlySet<unknown> = new Set(["postToolUse", "postToolUseFailure"]);

/**
 * Cursor (ARCHITECTURE §10): `preToolUse`, `beforeShellExecution`, `postToolUse`,
 * `postToolUseFailure` and `stop`. It always reads JSON: a `permission` before an action, and
 * after a command, which it cannot block, an `additional_context` that goes into the conversation.
 */
export const cursor: AgentAdapter = {
  tool: "cursor",
  kind: (event) => (AFTER.has(event.hook_event_name) ? "after" : "before"),
  action,
  reply: (verdict, phase) => {
    if (phase === "after") return json(verdict.allow ? {} : { additional_context: verdict.text });
    return json(
      verdict.allow
        ? { permission: "allow" }
        : {
            permission: "deny",
            user_message: `specty: ${verdict.reason}`,
            agent_message: verdict.text,
          },
    );
  },
  failed: (message) => json({ permission: "allow", user_message: message }),
  // Its own `loop_limit` keeps the turn from looping, and only a completed turn counts.
  stop: {
    acts: (event) => event.status === "completed",
    reply: (message) => JSON.stringify({ followup_message: message }),
    files: [CURSOR_HOOKS],
    hook: (command) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.stop) ? hooks.stop : [];
      return { ...value, hooks: { ...hooks, stop: [...current, { command }] } };
    },
  },
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool cursor`;
    await rewriteJson(join(root, CURSOR_HOOKS), (value) => withGuard(value, command), true, files);
    if (local) await excludeLocally(git, CURSOR_HOOKS, files);
    return {
      done: [guardLine("Cursor", CURSOR_HOOKS, local, lang)],
      warnings: [],
      written: local ? [] : [CURSOR_HOOKS],
    };
  },
  remove: (root, files) =>
    removeFromJson(
      root,
      CURSOR_HOOKS,
      (value) => withHooks(value, EVENTS, "cursor", undefined),
      files,
    ),
  doctor: async (root) => {
    const hooks = await readText(join(root, CURSOR_HOOKS));
    const missing = missingEvents([hooks], Object.keys(EVENTS), "cursor");
    const before = missing.includes("preToolUse") || missing.includes("beforeShellExecution");
    return doctorLines([
      [
        missing.length === 0,
        { code: "cursor-guard" },
        before
          ? { code: "no-cursor-guard" }
          : { code: "cursor-after-command", events: missing.join(", ") },
      ],
    ]);
  },
};

/** The guard in each of its events, in `.cursor/hooks.json` (`version: 1`). */
function withGuard(value: Record<string, unknown>, command: string): Record<string, unknown> {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const updated = Object.entries(EVENTS).map(([name, matcher]) => {
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

function json(value: Readonly<Record<string, string>>): GuardReply {
  return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}

function action(event: Readonly<Record<string, unknown>>): RawAction {
  if (event.hook_event_name === "beforeShellExecution") return shellAction(event.command);
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const paths = [input.file_path, input.path, input.target_file, input.filePath].flatMap(sentPaths);
  switch (event.tool_name) {
    case "Shell":
      return shellAction(input.command);
    case "Write":
      return { kind: "write", paths };
    case "Delete":
      return { kind: "delete", paths };
    default:
      return { kind: "other" };
  }
}
