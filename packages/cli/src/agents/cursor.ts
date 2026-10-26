// SPDX-License-Identifier: Apache-2.0
import { type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { isRecord } from "../io/files";
import type { AgentAdapter } from "./adapter";

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
    files: [".cursor/hooks.json"],
    hook: (command) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.stop) ? hooks.stop : [];
      return { ...value, hooks: { ...hooks, stop: [...current, { command }] } };
    },
  },
};

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
