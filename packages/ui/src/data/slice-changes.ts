// SPDX-License-Identifier: Apache-2.0
// The change that implements each slice of an epic, among the changes the UI has loaded: the
// epic's Cortes section in its Spec tab and its card in the Inbox pick it the same way. Pure.
import type { ChangeSummary } from "./records";

/** What a change needs to be picked for a slice: its id, its phase and the epic it belongs to. */
type Candidate = Pick<ChangeSummary, "id" | "phase" | "epic">;

/**
 * The change of each slice of `epic` among `changes`, by the slice's id: a closed one or, without
 * one, the first of the others; a cancelled change frees its slice, as in the epic's card
 * (`flow/epic.ts`).
 */
export function loadedSliceChanges<T extends Candidate>(
  epic: string,
  changes: readonly T[],
): ReadonlyMap<string, T> {
  const found = new Map<string, T>();
  for (const change of changes) {
    const slice = change.epic?.id === epic ? change.epic.slice : undefined;
    if (slice === undefined || change.phase === "cancelled") continue;
    const kept = found.get(slice);
    if (kept === undefined || (change.phase === "done" && kept.phase !== "done")) {
      found.set(slice, change);
    }
  }
  return found;
}
