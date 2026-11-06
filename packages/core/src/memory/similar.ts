// SPDX-License-Identifier: Apache-2.0
import { similarTexts } from "../flow/duplicates";
import { byDate, isOpenEntry, type MemoryEntry, type MemoryKind, parseEntryId } from "./entries";

// A pending item like an open one does not get in twice (ADR 0016): `memory add` compares the new
// one with the open pending items and improvements, with the likeness `new` uses for changes.

/** An entry `memory add` is about to write, and the open ones it was told it does not repeat. */
interface NewEntry {
  readonly kind: MemoryKind;
  readonly text: string;
  /** Entry ids as given to `--distinct-from`: `p78` or `P078` is P78. */
  readonly distinctFrom: readonly string[];
}

/** The kinds of entry a change resolves, the only ones the likeness brakes. */
const WORK: readonly MemoryKind[] = ["pending", "improvement"];

/**
 * The open pending items and improvements a new one looks like, by date: taken or proposed to drop
 * too, as they still wait for something, and alike as `similarTexts` says of their whole texts.
 * None for a new entry of another kind, and none of those in `distinctFrom`.
 */
export function similarEntries(
  entries: readonly MemoryEntry[],
  candidate: NewEntry,
): readonly MemoryEntry[] {
  if (!WORK.includes(candidate.kind)) return [];
  const apart = new Set(candidate.distinctFrom.map((raw) => parseEntryId(raw) ?? raw.trim()));
  return byDate(
    entries.filter(
      (entry) =>
        WORK.includes(entry.kind) &&
        isOpenEntry(entry) &&
        !apart.has(entry.id) &&
        similarTexts(candidate.text, entry.text),
    ),
  );
}
