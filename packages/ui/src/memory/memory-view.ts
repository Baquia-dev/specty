// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import { fold, localDay, sessionEntries } from "@baquia-dev/specty-core/light";
import type { Bilingual, MemoryOrigin, MemoryRecord } from "../data/records";

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
  readonly key: "turn" | "holders" | "work" | "decisions" | "lessons" | "waiting" | "closed";
  readonly label: Bilingual;
  readonly items: readonly MemoryItem[];
  /** «Pendientes y mejoras»: its entries by the feature they came from, `items` in their order. */
  readonly groups?: readonly MemoryGroup[];
}

/** An open pending item or improvement, as a group of «Pendientes y mejoras» lists it. */
type WorkItem = Extract<MemoryItem, { readonly kind: "work" }>;

/** The change heading a group of «Pendientes y mejoras»: its id, with what the source says of it. */
export interface MemoryFeature extends MemoryOrigin {
  readonly id: string;
}

/**
 * A group of «Pendientes y mejoras»: the change its entries came from, with them by date, the
 * oldest first; for an epic, its own entries and then its slices with entries, each a group.
 * «Sin feature», the entries of no change, has none.
 */
export interface MemoryGroup {
  readonly change?: MemoryFeature;
  readonly items: readonly WorkItem[];
  readonly features: readonly MemoryGroup[];
}

type Origins = Readonly<Record<string, MemoryOrigin>>;

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
  waiting: { es: "Recordatorios que esperan", en: "Reminders that wait" },
  closed: { es: "Hechas y descartadas", en: "Done and dropped" },
};

/**
 * The sections of the memory page, in order, without the empty ones: «Te toca» (proposals to
 * drop, changes waiting for the person and open reminders), who holds each open change, the open
 * pending items and improvements by date, the open decisions and lessons, the reminders that
 * wait for their day (after `today`), their paths or a change and, with `filter.closed`, the done
 * and dropped entries. The search and the kind leave out what they do not keep; a kind leaves out
 * the changes, which are not entries.
 */
export function memorySections(
  record: MemoryRecord,
  filter = NO_FILTER,
  today = localDay(new Date()),
): MemorySection[] {
  const { entries, changes } = filtered(record, filter);
  const open = byDate(entries.filter((entry) => !isClosed(entry)));
  const proposed = open.filter((entry) => entry.status === "drop-proposed");
  const settled = open.filter((entry) => entry.status !== "drop-proposed");
  const of = (kinds: readonly MemoryEntry["kind"][]) =>
    settled.filter((entry) => kinds.includes(entry.kind));
  // The same rule as the start card and «TE TOCA» of `specty status` (ADR 0016).
  const due = new Set(sessionEntries(settled, today));
  const reminders = (waiting: boolean) =>
    of(["reminder"])
      .filter((entry) => due.has(entry) !== waiting)
      .map((entry): MemoryItem => ({ kind: "reminder", entry }));
  const closed = filter.closed ? byDate(entries.filter(isClosed)) : [];
  const sections: MemorySection[] = [
    section("turn", [
      ...proposed.map((entry): MemoryItem => ({ kind: "proposal", entry })),
      ...changes
        .filter((change) => change.waitingFor === "human")
        .map((change): MemoryItem => ({ kind: "waiting", change })),
      ...reminders(false),
    ]),
    section(
      "holders",
      changes.map((change): MemoryItem => ({ kind: "holder", change })),
    ),
    workSection(of(["pending", "improvement"]), record.origins ?? {}),
    section(
      "decisions",
      of(["decision"]).map((entry): MemoryItem => ({ kind: "decision", entry })),
    ),
    section(
      "lessons",
      of(["lesson"]).map((entry): MemoryItem => ({ kind: "lesson", entry })),
    ),
    section("waiting", reminders(true)),
    section(
      "closed",
      closed.map((entry): MemoryItem => ({ kind: "closed", entry })),
    ),
  ];
  return sections.filter((found) => found.items.length > 0);
}

/**
 * What the search and the kind keep: a kind leaves out the changes, which are not entries. An
 * entry is found by the title of the change it came from and by that of its epic too.
 */
function filtered(record: MemoryRecord, filter: MemoryFilter): MemoryRecord {
  const query = fold(filter.query);
  const origin = (entry: MemoryEntry) =>
    entry.origin.change === undefined ? undefined : record.origins?.[entry.origin.change];
  const entries = record.entries.filter(
    (entry) =>
      (filter.kind === "all" || entry.kind === filter.kind) &&
      matches(query, [
        entry.id,
        entry.text,
        entry.quote,
        entry.origin.change,
        origin(entry)?.title,
        origin(entry)?.epic?.title,
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

/** «Pendientes y mejoras», by groups (`featureGroups`), and its entries in their order. */
function workSection(entries: readonly MemoryEntry[], origins: Origins): MemorySection {
  const groups = featureGroups(entries, origins);
  return { ...section("work", groups.flatMap(itemsOf)), groups };
}

/**
 * The groups of `entries`, already by date: each change's entries under it, a slice's inside the
 * group of its epic, after the epic's own, and the groups by their newest entry, the newest first;
 * then the entries of no change, in «Sin feature». A change the source says nothing of goes by its
 * id; an epic it does not give, with the title its slices give it.
 */
function featureGroups(entries: readonly MemoryEntry[], origins: Origins): readonly MemoryGroup[] {
  const own = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const id = entry.origin.change ?? "";
    own.set(id, [...(own.get(id) ?? []), entry]);
  }
  const heads = new Map<string, MemoryFeature>();
  const slices = new Map<string, MemoryGroup[]>();
  for (const [id, mine] of own) {
    if (id === "") continue;
    const change = featureOf(id, origins);
    const epic = change.epic;
    if (epic === undefined) {
      heads.set(id, change);
      continue;
    }
    if (!heads.has(epic.id))
      heads.set(epic.id, featureOf(epic.id, origins, { title: epic.title, kind: "epic" }));
    slices.set(epic.id, [...(slices.get(epic.id) ?? []), groupOf(change, mine, [])]);
  }
  const groups = [...heads.values()].map((change) =>
    groupOf(change, own.get(change.id) ?? [], byNewest(slices.get(change.id) ?? [])),
  );
  const loose = own.get("");
  return [...byNewest(groups), ...(loose === undefined ? [] : [groupOf(undefined, loose, [])])];
}

/** The change `id` as the source says it, or as `fallback`, by its id when there is none. */
function featureOf(
  id: string,
  origins: Origins,
  fallback: MemoryOrigin = { title: id },
): MemoryFeature {
  return { id, ...(origins[id] ?? fallback) };
}

function groupOf(
  change: MemoryFeature | undefined,
  entries: readonly MemoryEntry[],
  features: readonly MemoryGroup[],
): MemoryGroup {
  return {
    ...(change === undefined ? {} : { change }),
    items: entries.map((entry): WorkItem => ({ kind: "work", entry })),
    features,
  };
}

/** The entries of a group: its own, then those of its slices. */
function itemsOf(group: MemoryGroup): readonly WorkItem[] {
  return [...group.items, ...group.features.flatMap(itemsOf)];
}

/** By their newest entry, the newest first; on the same date, as they came. */
function byNewest(groups: readonly MemoryGroup[]): readonly MemoryGroup[] {
  const newest = (group: MemoryGroup) =>
    itemsOf(group).reduce(
      (latest, { entry }) => (entry.created > latest ? entry.created : latest),
      "",
    );
  return groups.toSorted((a, b) => newest(b).localeCompare(newest(a)));
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
