// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import type { Bilingual, MemoryRecord } from "../data/records";

// The memory page (ADR 0016): what is the person's turn, who holds each open change, and the open
// pending items, improvements and decisions, without showing an entry twice.

/** One row of the memory page. */
export type MemoryItem =
  /** An entry an agent proposed to drop: only the person drops it. */
  | { readonly kind: "proposal"; readonly entry: MemoryEntry }
  /** An open change that waits for the person's decision. */
  | { readonly kind: "waiting"; readonly change: StatusEntry }
  | { readonly kind: "reminder"; readonly entry: MemoryEntry }
  /** An open change, with who holds it or whether it is an orphan. */
  | { readonly kind: "holder"; readonly change: StatusEntry }
  /** An open pending item or improvement. */
  | { readonly kind: "work"; readonly entry: MemoryEntry }
  | { readonly kind: "decision"; readonly entry: MemoryEntry };

export interface MemorySection {
  readonly key: "turn" | "holders" | "work" | "decisions";
  readonly label: Bilingual;
  readonly items: readonly MemoryItem[];
}

const LABELS: Readonly<Record<MemorySection["key"], Bilingual>> = {
  turn: { es: "Te toca", en: "Your turn" },
  holders: { es: "Quién lleva cada cambio", en: "Who holds each change" },
  work: { es: "Pendientes y mejoras", en: "Pending items and improvements" },
  decisions: { es: "Decisiones", en: "Decisions" },
};

/**
 * The sections of the memory page, in order, without the empty ones: «Te toca» (proposals to
 * drop, changes waiting for the person and open reminders), who holds each open change, the open
 * pending items and improvements by date, and the open decisions.
 */
export function memorySections(record: MemoryRecord): MemorySection[] {
  const open = byDate(
    record.entries.filter((entry) => entry.status !== "done" && entry.status !== "dropped"),
  );
  const proposed = open.filter((entry) => entry.status === "drop-proposed");
  const settled = open.filter((entry) => entry.status !== "drop-proposed");
  const of = (kinds: readonly MemoryEntry["kind"][]) =>
    settled.filter((entry) => kinds.includes(entry.kind));
  const sections: MemorySection[] = [
    section("turn", [
      ...proposed.map((entry): MemoryItem => ({ kind: "proposal", entry })),
      ...record.changes
        .filter((change) => change.waitingFor === "human")
        .map((change): MemoryItem => ({ kind: "waiting", change })),
      ...of(["reminder"]).map((entry): MemoryItem => ({ kind: "reminder", entry })),
    ]),
    section(
      "holders",
      record.changes.map((change): MemoryItem => ({ kind: "holder", change })),
    ),
    section(
      "work",
      of(["pending", "improvement"]).map((entry): MemoryItem => ({ kind: "work", entry })),
    ),
    section(
      "decisions",
      of(["decision"]).map((entry): MemoryItem => ({ kind: "decision", entry })),
    ),
  ];
  return sections.filter((found) => found.items.length > 0);
}

function section(key: MemorySection["key"], items: readonly MemoryItem[]): MemorySection {
  return { key, label: LABELS[key], items };
}

/** By date and, on the same date, the P ids before the D ones, each by number. */
function byDate(entries: readonly MemoryEntry[]): readonly MemoryEntry[] {
  const number = (entry: MemoryEntry) => Number(entry.id.slice(1));
  return entries.toSorted(
    (a, b) =>
      a.created.localeCompare(b.created) ||
      b.id.charAt(0).localeCompare(a.id.charAt(0)) ||
      number(a) - number(b),
  );
}
