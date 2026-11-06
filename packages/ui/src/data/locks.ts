// SPDX-License-Identifier: Apache-2.0
// The approved tests a change locked (ADR 0014): `lockedTests` of `state.json`, the one unlocked
// for the task in progress, and the unlocks a person approved, from `scope.decided` with `unlock`
// and the reason of its `scope.requested` (formats.md §4). Pure: it runs in the derivation worker.
import type { ChangeState, UnlockEvidence } from "@baquia-dev/specty-core";
import { count, type Data, isData, text, texts } from "./history-text";
import type { AuditRecord } from "./progress";

/**
 * An unlock the person approved: the request and the task it was for, the agent's reason, and the
 * patch and the evidence it was approved with, which an unlock of an older CLI does not have.
 */
interface UnlockView {
  readonly request: string;
  readonly task: string;
  readonly reason?: string;
  readonly patch?: string;
  readonly evidence?: readonly UnlockEvidence[];
}

export interface LockedTestView {
  readonly path: string;
  /** The task in progress may change it: an approved request unlocked it until the task is done. */
  readonly unlockedFor?: string;
  readonly unlocks: readonly UnlockView[];
}

/** What of a scope request says whether it unlocks: its task and its paths. */
interface ScopeRequest {
  readonly task: string;
  readonly paths: readonly string[];
}

/** The task in progress that has `path` in its scope, if any: the guard lets only it change it. */
function unlockedFor(state: ChangeState, path: string): string | undefined {
  return Object.entries(state.tasks).find(
    ([, task]) => task.status === "active" && task.scopeExtra.includes(path),
  )?.[0];
}

/** The unlocks of each path, in the audit's order, each with the reason its request gave. */
function unlocksByPath(audit: readonly AuditRecord[]): ReadonlyMap<string, UnlockView[]> {
  const byPath = new Map<string, UnlockView[]>();
  const reasons = new Map<string, string>();
  for (const { event, data } of audit) {
    const record: Data = data ?? {};
    const id = text(record, "id");
    const reason = text(record, "reason");
    if (event === "scope.requested" && id !== undefined && reason !== undefined) {
      reasons.set(id, reason);
    }
    if (event !== "scope.decided") continue;
    const unlock = unlockOf(record, reasons);
    if (unlock === undefined) continue;
    for (const path of texts(record, "unlock")) {
      byPath.set(path, [...(byPath.get(path) ?? []), unlock]);
    }
  }
  return byPath;
}

/** What a `scope.decided` tells of an unlock: nothing without its request and its task. */
function unlockOf(decided: Data, reasons: ReadonlyMap<string, string>): UnlockView | undefined {
  const request = text(decided, "id");
  const task = text(decided, "task");
  if (request === undefined || task === undefined) return undefined;
  const reason = reasons.get(request);
  const patch = text(decided, "patch");
  const evidence = evidenceOf(decided.evidence);
  return {
    request,
    task,
    ...(reason === undefined ? {} : { reason }),
    ...(patch === undefined ? {} : { patch }),
    ...(evidence.length === 0 ? {} : { evidence }),
  };
}

/** The pieces of evidence that have their path, their lines and their text; the others, left out. */
function evidenceOf(value: unknown): readonly UnlockEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isData).flatMap((piece) => {
    const path = text(piece, "path");
    const from = count(piece, "from");
    const to = count(piece, "to");
    const { text: lines } = piece;
    if (path === undefined || from === undefined || to === undefined) return [];
    return typeof lines === "string" ? [{ path, from, to, text: lines }] : [];
  });
}

/** Each locked test, by its path. */
export function lockedOf(
  state: ChangeState,
  audit: readonly AuditRecord[],
): readonly LockedTestView[] {
  const paths = Object.keys(state.lockedTests ?? {}).toSorted();
  if (paths.length === 0) return [];
  const unlocks = unlocksByPath(audit);
  return paths.map((path) => {
    const task = unlockedFor(state, path);
    return {
      path,
      ...(task === undefined ? {} : { unlockedFor: task }),
      unlocks: unlocks.get(path) ?? [],
    };
  });
}

/**
 * The locked tests a scope request asks for that its task does not have yet: what makes it an
 * unlock, as `specty scope add` reads it.
 */
export function unlocksOf(state: ChangeState, request: ScopeRequest): readonly string[] {
  const locked = state.lockedTests ?? {};
  const extra = state.tasks[request.task]?.scopeExtra ?? [];
  return request.paths.filter((path) => Object.hasOwn(locked, path) && !extra.includes(path));
}
