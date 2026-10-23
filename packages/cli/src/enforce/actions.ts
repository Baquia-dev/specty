// SPDX-License-Identifier: Apache-2.0
import { patchPaths } from "@baquia-dev/specty-core";
import { isRecord } from "../io/files";
import type { EnterRequest } from "./sessions";

export type GuardTool = "claude-code" | "cursor" | "codex" | "opencode";

const GUARD_TOOLS: readonly GuardTool[] = ["claude-code", "cursor", "codex", "opencode"];

export function isGuardTool(value: string): value is GuardTool {
  return GUARD_TOOLS.some((tool) => tool === value);
}

/** Tools whose hooks also run after each shell command, so the guard checks what it changed. */
export function checksAfterShell(tool: GuardTool): boolean {
  return tool === "claude-code" || tool === "codex";
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

/** Reads the event each tool's hook sends before an action. */
export function toolAction(tool: GuardTool, event: Record<string, unknown>): RawAction {
  if (tool === "cursor") return cursorAction(event);
  if (tool === "codex") return codexAction(event);
  if (tool === "opencode") return opencodeAction(event);
  return claudeAction(event);
}

function claudeAction(event: Record<string, unknown>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "Edit":
    case "MultiEdit":
    case "Write":
      return { kind: "write", paths: strings(input.file_path) };
    case "NotebookEdit":
      return { kind: "write", paths: strings(input.notebook_path) };
    case "Bash":
      return typeof input.command === "string"
        ? { kind: "shell", command: input.command }
        : { kind: "other" };
    case "EnterWorktree":
      return {
        kind: "enter",
        request: {
          ...(typeof input.path === "string" ? { path: input.path } : {}),
          ...(typeof input.name === "string" ? { name: input.name } : {}),
        },
      };
    default:
      return { kind: "other" };
  }
}

function cursorAction(event: Record<string, unknown>): RawAction {
  if (event.hook_event_name === "beforeShellExecution") {
    return typeof event.command === "string"
      ? { kind: "shell", command: event.command }
      : { kind: "other" };
  }
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const paths = [input.file_path, input.path, input.target_file, input.filePath].flatMap(strings);
  switch (event.tool_name) {
    case "Shell":
      return typeof input.command === "string"
        ? { kind: "shell", command: input.command }
        : { kind: "other" };
    case "Write":
      return { kind: "write", paths };
    case "Delete":
      return { kind: "delete", paths };
    default:
      return { kind: "other" };
  }
}

/** Codex sends a command and a patch alike in `tool_input.command`. */
function codexAction(event: Record<string, unknown>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  if (typeof input.command !== "string") return { kind: "other" };
  switch (event.tool_name) {
    case "Bash":
      return { kind: "shell", command: input.command };
    case "apply_patch":
      return { kind: "files", ...patchPaths(input.command) };
    default:
      return { kind: "other" };
  }
}

/**
 * OpenCode, through Specty's plugin, which sends the tool and its arguments as `tool_name` and
 * `tool_input`. It takes the names of OpenCode 2 and those of OpenCode 1 (`bash`, `filePath`,
 * `multiedit`, `apply_patch`).
 */
function opencodeAction(event: Record<string, unknown>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "shell":
    case "bash":
      return typeof input.command === "string"
        ? { kind: "shell", command: input.command }
        : { kind: "other" };
    case "edit":
    case "write":
    case "multiedit":
      return { kind: "write", paths: [input.path, input.filePath].flatMap(strings) };
    case "patch":
    case "apply_patch":
      return typeof input.patchText === "string"
        ? { kind: "files", ...patchPaths(input.patchText) }
        : { kind: "other" };
    default:
      return { kind: "other" };
  }
}

function strings(value: unknown): string[] {
  return typeof value === "string" && value.length > 0 ? [value] : [];
}
