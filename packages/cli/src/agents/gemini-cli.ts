// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { geminiTrustWarning, guardLine } from "@baquia-dev/specty-core";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import {
  excludeLocally,
  GEMINI_SETTINGS,
  hasGuard,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import { type AgentAdapter, exitFailed, exitReply } from "./adapter";

/** The events the guard listens to, each with a regular expression on `tool_name`. */
const EVENTS: Readonly<Record<string, string>> = {
  BeforeTool: "run_shell_command|write_file|replace",
  AfterTool: "run_shell_command",
};

/**
 * Gemini CLI (ARCHITECTURE §10): `BeforeTool` and `AfterTool` in its project settings, shaped as
 * Claude Code's hooks. Before an action it reads exit 2 as Claude Code does, and sends stderr to
 * the agent as the tool's error; after a command, the warning follows its result
 * (`additionalContext`). Its input brings no id for the tool call.
 */
export const geminiCli: AgentAdapter = {
  tool: "gemini-cli",
  normalize,
  kind: (event) => (event.hook_event_name === "AfterTool" ? "after" : "before"),
  action,
  reply: (verdict, phase) => {
    if (phase === "before" || verdict.allow) return exitReply(verdict);
    const output = {
      hookSpecificOutput: { hookEventName: "AfterTool", additionalContext: verdict.text },
    };
    return { code: 0, stdout: JSON.stringify(output), stderr: "" };
  },
  failed: exitFailed,
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool gemini-cli`;
    await rewriteJson(
      join(root, GEMINI_SETTINGS),
      (value) => withHooks(value, EVENTS, "gemini-cli", command),
      true,
      files,
    );
    if (local) await excludeLocally(git, GEMINI_SETTINGS, files);
    return {
      done: [guardLine("Gemini CLI", GEMINI_SETTINGS, local, lang)],
      warnings: [geminiTrustWarning(lang)],
      written: local ? [] : [GEMINI_SETTINGS],
    };
  },
  remove: (root, files) =>
    removeFromJson(
      root,
      GEMINI_SETTINGS,
      (value) => withHooks(value, EVENTS, "gemini-cli", undefined),
      files,
    ),
  doctor: async (root) => {
    const text = await readText(join(root, GEMINI_SETTINGS));
    const file = GEMINI_SETTINGS;
    if (!hasGuard(text, "gemini-cli")) {
      return { ok: [], problems: [{ code: "no-gemini-guard", file }] };
    }
    const missing = missingEvents([text], Object.keys(EVENTS), "gemini-cli");
    return missing.length === 0
      ? { ok: [{ code: "gemini-guard", file }], problems: [] }
      : { ok: [], problems: [{ code: "gemini-hooks", file, events: missing.join(", ") }] };
  },
};

/**
 * Its input, in the names the guard reads: a command runs in its `dir_path`, and a tool call is
 * known by its session and its input, the same before and after it, since none brings an id.
 */
function normalize(event: Record<string, unknown>): Record<string, unknown> {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const folder = typeof input.dir_path === "string" && input.dir_path !== "" ? input.dir_path : "";
  const cwd =
    typeof event.cwd === "string" && folder !== "" ? resolve(event.cwd, folder) : event.cwd;
  const session = typeof event.session_id === "string" ? event.session_id : undefined;
  const call = createHash("sha256")
    .update(`${String(event.tool_name)}\n${JSON.stringify(input)}`)
    .digest("hex")
    .slice(0, 16);
  return { ...event, cwd, ...(session === undefined ? {} : { tool_use_id: `${session}-${call}` }) };
}

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "run_shell_command":
      return shellAction(input.command);
    case "write_file":
    case "replace":
      return { kind: "write", paths: sentPaths(input.file_path) };
    default:
      return { kind: "other" };
  }
}
