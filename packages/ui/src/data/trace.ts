// SPDX-License-Identifier: Apache-2.0
// The traceability of a change's files (docs/ui.md, Historial): each file as the change left it,
// in blocks with what `specty why` tells of their commit.
import type { WhyCommit } from "@baquia-dev/specty-core";
import { isObject } from "./server-answers";

/** Lines in a row from the same commit, from `start` to `end` (from 1). */
export interface TraceBlock {
  readonly start: number;
  readonly end: number;
  /** The commit and, when Specty made it, its change, its task and the criteria it covers. */
  readonly commit: WhyCommit;
}

/** A file as its change left it, at `commit`, the one of its last task. */
export interface TraceRecord {
  readonly path: string;
  readonly commit: string;
  readonly lines: readonly string[];
  readonly blocks: readonly TraceBlock[];
}

export function isStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Whether the server answered a trace: the file, its lines and blocks with a commit each. */
export function isTrace(value: unknown): value is TraceRecord {
  return (
    isObject(value) &&
    typeof value.path === "string" &&
    typeof value.commit === "string" &&
    isStrings(value.lines) &&
    Array.isArray(value.blocks) &&
    value.blocks.every(isBlock)
  );
}

function isBlock(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    isObject(value.commit) &&
    typeof value.commit.commit === "string"
  );
}
