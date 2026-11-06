// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { type GuardedAgent, isAgentTool, isGuardedAgent } from "@baquia-dev/specty-core";
import { isRecord } from "../io/files";
import type { EnterRequest } from "./sessions";

/** The agents with Specty's guard, as the capability table says (`AGENT_CAPABILITIES`). */
export type GuardTool = GuardedAgent;

export function isGuardTool(value: string): value is GuardTool {
  return isAgentTool(value) && isGuardedAgent(value);
}

/** What the guard prints and the code it exits with, in the form of the agent's tool. */
export interface GuardReply {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The tool call that links the hooks before and after a command, safe as a file name. */
export function toolUseId(event: Record<string, unknown>): string | undefined {
  return safeName(event.tool_use_id);
}

/** The agent's conversation the event belongs to (Cursor's `conversation_id`), safe as a file name. */
export function conversationOf(event: Record<string, unknown>): string | undefined {
  return safeName(event.session_id ?? event.conversation_id);
}

/**
 * The subagent the event comes from (the `agent_id` of Claude Code and Codex), safe as a file
 * name; undefined for an event of the main conversation.
 */
export function subagentOf(event: Record<string, unknown>): string | undefined {
  return safeName(event.agent_id);
}

/**
 * The event of a subagent as a conversation of its own, `<session>--<subagent>`: for a tool whose
 * subagents send the id of the session that launched them, so that its binding, its steps and its
 * front are its own. Any other event stays as it is.
 */
export function asSubagentConversation(event: Record<string, unknown>): Record<string, unknown> {
  const agent = subagentOf(event);
  const session = safeName(event.session_id);
  return agent === undefined || session === undefined
    ? event
    : { ...event, session_id: `${session}--${agent}` };
}

function safeName(id: unknown): string | undefined {
  return typeof id === "string" && /^[\w-]{1,128}$/.test(id) ? id : undefined;
}

/** The folder the event happens in. */
export function cwdOf(event: Record<string, unknown>, fallback: string): string {
  const roots = event.workspace_roots;
  const base =
    typeof event.cwd === "string" && event.cwd.length > 0
      ? event.cwd
      : Array.isArray(roots) && typeof roots[0] === "string"
        ? roots[0]
        : fallback;
  // A command that names its own folder (OpenCode's `workdir`) runs there.
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  return typeof input.workdir === "string" && input.workdir.length > 0
    ? resolve(base, input.workdir)
    : base;
}

/** A tool event, reduced to what the flow cares about. Paths are still as the tool sent them. */
export type RawAction =
  | { readonly kind: "write" | "delete" | "read"; readonly paths: readonly string[] }
  | {
      readonly kind: "files";
      readonly writes: readonly string[];
      readonly deletes: readonly string[];
    }
  | { readonly kind: "shell"; readonly command: string }
  | { readonly kind: "enter"; readonly request: EnterRequest }
  /** A tool of the agent's own removes the worktree at `path` (OpenCode's `worktree_remove`). */
  | { readonly kind: "remove-worktree"; readonly path: string }
  | { readonly kind: "other" };

/** A path the tool sent, as a list: empty when it sent none. */
export function sentPaths(value: unknown): string[] {
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

/** A shell command the tool sent, as an action; anything else is no action of Specty's. */
export function shellAction(command: unknown): RawAction {
  return typeof command === "string" ? { kind: "shell", command } : { kind: "other" };
}
