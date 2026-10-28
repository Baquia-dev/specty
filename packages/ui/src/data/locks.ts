// SPDX-License-Identifier: Apache-2.0
// The approved tests a change locked (ADR 0014): `lockedTests` of `state.json`, the one unlocked
// for the task in progress, and the unlocks a person approved, from `scope.decided` with `unlock`
// (formats.md §4). Pure: it runs in the derivation worker.
import type { ChangeState } from "@baquia-dev/specty-core";
import { type Data, text, texts } from "./history-text";
import type { AuditRecord } from "./progress";

/** An unlock the person approved: the request and the task it was for. */
interface UnlockView {
  readonly request: string;
  readonly task: string;
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

/** The unlocks of each path, in the audit's order. */
function unlocksByPath(audit: readonly AuditRecord[]): ReadonlyMap<string, UnlockView[]> {
  const byPath = new Map<string, UnlockView[]>();
  for (const { event, data } of audit) {
    if (event !== "scope.decided") continue;
    const decided: Data = data ?? {};
    const request = text(decided, "id");
    const task = text(decided, "task");
    if (request === undefined || task === undefined) continue;
    for (const path of texts(decided, "unlock")) {
      byPath.set(path, [...(byPath.get(path) ?? []), { request, task }]);
    }
  }
  return byPath;
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
