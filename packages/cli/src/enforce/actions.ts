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
  const id = event.tool_use_id;
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
  | { readonly kind: "write" | "delete"; readonly paths: readonly string[] }
  | {
      readonly kind: "files";
      readonly writes: readonly string[];
      readonly deletes: readonly string[];
    }
  | { readonly kind: "shell"; readonly command: string }
  | { readonly kind: "enter"; readonly request: EnterRequest }
  | { readonly kind: "other" };

/** A path the tool sent, as a list: empty when it sent none. */
export function sentPaths(value: unknown): string[] {
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

/** A shell command the tool sent, as an action; anything else is no action of Specty's. */
export function shellAction(command: unknown): RawAction {
  return typeof command === "string" ? { kind: "shell", command } : { kind: "other" };
}
