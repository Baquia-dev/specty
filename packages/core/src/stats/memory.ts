// SPDX-License-Identifier: Apache-2.0
// The panel's «Memoria» (docs/ui.md, «Panel»): the entries noted in a period, by their status
// today and by their kind.
import type { MemoryEntry, MemoryKind, MemoryStatus } from "../memory/entries";
import { dayOf, inRange, type StatsRange } from "./period";

/** The entries noted in a period: how many, and how many of each status and of each kind. */
export interface StatsMemory {
  readonly entries: number;
  readonly statuses: Readonly<Record<MemoryStatus, number>>;
  readonly kinds: Readonly<Record<MemoryKind, number>>;
}

/** The entries of `memory` created in `range`, by status and by kind. */
export function statsMemory(memory: readonly MemoryEntry[], range: StatsRange): StatsMemory {
  const noted = memory.filter((entry) => inRange(dayOf(entry.created), range));
  const status = (one: MemoryStatus) => noted.filter((entry) => entry.status === one).length;
  const kind = (one: MemoryKind) => noted.filter((entry) => entry.kind === one).length;
  return {
    entries: noted.length,
    statuses: {
      open: status("open"),
      taken: status("taken"),
      done: status("done"),
      "drop-proposed": status("drop-proposed"),
      dropped: status("dropped"),
    },
    kinds: {
      pending: kind("pending"),
      improvement: kind("improvement"),
      reminder: kind("reminder"),
      decision: kind("decision"),
      lesson: kind("lesson"),
    },
  };
}
