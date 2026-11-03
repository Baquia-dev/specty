// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import { fold } from "@baquia-dev/specty-core/light";
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
  | { readonly kind: "decision"; readonly entry: MemoryEntry }
  /** An open lesson, with the paths it is about. */
  | { readonly kind: "lesson"; readonly entry: MemoryEntry }
  /** An entry done or dropped, shown on demand. */
  | { readonly kind: "closed"; readonly entry: MemoryEntry };

export interface MemorySection {
  readonly key: "turn" | "holders" | "work" | "decisions" | "lessons" | "closed";
  readonly label: Bilingual;
  readonly items: readonly MemoryItem[];
}

/** What the page's toolbar keeps: the search, one kind of entry or all, and the closed ones. */
export interface MemoryFilter {
  readonly query: string;
  readonly kind: "all" | MemoryEntry["kind"];
  readonly closed: boolean;
}

const NO_FILTER: MemoryFilter = { query: "", kind: "all", closed: false };

const LABELS: Readonly<Record<MemorySection["key"], Bilingual>> = {
  turn: { es: "Te toca", en: "Your turn" },
  holders: { es: "Quién lleva cada cambio", en: "Who holds each change" },
  work: { es: "Pendientes y mejoras", en: "Pending items and improvements" },
  decisions: { es: "Decisiones", en: "Decisions" },
  lessons: { es: "Lecciones", en: "Lessons" },
  closed: { es: "Hechas y descartadas", en: "Done and dropped" },
};

/**
 * The sections of the memory page, in order, without the empty ones: «Te toca» (proposals to
 * drop, changes waiting for the person and open reminders), who holds each open change, the open
 * pending items and improvements by date, the open decisions and, with `filter.closed`, the done
 * and dropped entries. The search and the kind leave out what they do not keep; a kind leaves out
 * the changes, which are not entries.
 */
export function memorySections(record: MemoryRecord, filter = NO_FILTER): MemorySection[] {
  const { entries, changes } = filtered(record, filter);
  const open = byDate(entries.filter((entry) => !isClosed(entry)));
  const proposed = open.filter((entry) => entry.status === "drop-proposed");
  const settled = open.filter((entry) => entry.status !== "drop-proposed");
  const of = (kinds: readonly MemoryEntry["kind"][]) =>
    settled.filter((entry) => kinds.includes(entry.kind));
  const closed = filter.closed ? byDate(entries.filter(isClosed)) : [];
  const sections: MemorySection[] = [
    section("turn", [
      ...proposed.map((entry): MemoryItem => ({ kind: "proposal", entry })),
      ...changes
        .filter((change) => change.waitingFor === "human")
        .map((change): MemoryItem => ({ kind: "waiting", change })),
      ...of(["reminder"]).map((entry): MemoryItem => ({ kind: "reminder", entry })),
    ]),
    section(
      "holders",
      changes.map((change): MemoryItem => ({ kind: "holder", change })),
    ),
    section(
      "work",
      of(["pending", "improvement"]).map((entry): MemoryItem => ({ kind: "work", entry })),
    ),
    section(
      "decisions",
      of(["decision"]).map((entry): MemoryItem => ({ kind: "decision", entry })),
    ),
    section(
      "lessons",
      of(["lesson"]).map((entry): MemoryItem => ({ kind: "lesson", entry })),
    ),
    section(
      "closed",
      closed.map((entry): MemoryItem => ({ kind: "closed", entry })),
    ),
  ];
  return sections.filter((found) => found.items.length > 0);
}

/** What the search and the kind keep: a kind leaves out the changes, which are not entries. */
function filtered(record: MemoryRecord, filter: MemoryFilter): MemoryRecord {
  const query = fold(filter.query);
  const entries = record.entries.filter(
    (entry) =>
      (filter.kind === "all" || entry.kind === filter.kind) &&
      matches(query, [
        entry.id,
        entry.text,
        entry.quote,
        entry.origin.change,
        entry.taken?.change,
        ...(entry.paths ?? []),
      ]),
  );
  const changes =
    filter.kind === "all"
      ? record.changes.filter((change) => matches(query, [change.id, change.title]))
      : [];
  return { entries, changes };
}

function isClosed(entry: MemoryEntry): boolean {
  return entry.status === "done" || entry.status === "dropped";
}

/** Whether one of `fields` holds `query`, already folded: any, with no query. */
function matches(query: string, fields: readonly (string | undefined)[]): boolean {
  return query === "" || fields.some((field) => field !== undefined && fold(field).includes(query));
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
