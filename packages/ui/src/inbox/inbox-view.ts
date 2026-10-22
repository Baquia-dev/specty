// SPDX-License-Identifier: Apache-2.0
// What the Inbox shows, from the change views: filtered, grouped and sorted. Pure.
import { type Lang, PHASES, type Phase, type SizeLevel } from "@baquia-dev/specty-core";
import type { Bilingual, ChangeView } from "../data/records";
import { PHASE_LABELS } from "../theme/tokens";

export type InboxGroup = "state" | "phase" | "none";
export type InboxSort = "waiting" | "recent" | "title" | "size";
export type InboxPhase = Phase | "all";

export const INBOX_GROUPS: readonly InboxGroup[] = ["state", "phase", "none"];
export const INBOX_SORTS: readonly InboxSort[] = ["waiting", "recent", "title", "size"];

export interface InboxFilters {
  readonly query: string;
  readonly phase: InboxPhase;
  readonly group: InboxGroup;
  readonly sort: InboxSort;
}

export interface InboxSection {
  readonly key: string;
  readonly label: Bilingual;
  readonly changes: readonly ChangeView[];
}

/** Waiting for the person, in progress, or finished. */
export type InboxState = "decision" | "active" | "recent";

const STATES: readonly { readonly key: InboxState; readonly label: Bilingual }[] = [
  { key: "decision", label: { es: "Esperan tu decisión", en: "Waiting for your decision" } },
  { key: "active", label: { es: "En curso", en: "In progress" } },
  { key: "recent", label: { es: "Recientes", en: "Recent" } },
];

const SIZE: Readonly<Record<SizeLevel, number>> = { S: 1, M: 2, L: 3, XL: 4 };

export function stateOf(change: ChangeView): InboxState {
  if (change.decision !== undefined) return "decision";
  return change.phase === "done" || change.phase === "cancelled" ? "recent" : "active";
}

/** Lower case and without accents, so "evolucion" finds "Evolución". */
function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Whether the title or the id contain the query, ignoring case and accents. */
export function matchesQuery(change: ChangeView, query: string): boolean {
  const wanted = folded(query.trim());
  return (
    wanted === "" || folded(change.title).includes(wanted) || folded(change.id).includes(wanted)
  );
}

/** The changes the search and the phase filter let through. */
export function visibleChanges(
  changes: readonly ChangeView[],
  filters: Pick<InboxFilters, "query" | "phase">,
): readonly ChangeView[] {
  return changes.filter(
    (change) =>
      matchesQuery(change, filters.query) &&
      (filters.phase === "all" || change.phase === filters.phase),
  );
}

/** How many changes of each phase the search lets through, for the phase filters. */
export function phaseCounts(
  changes: readonly ChangeView[],
  query: string,
): ReadonlyMap<InboxPhase, number> {
  const found = changes.filter((change) => matchesQuery(change, query));
  return new Map<InboxPhase, number>([
    ["all", found.length],
    ...PHASES.map((phase): [InboxPhase, number] => [
      phase,
      found.filter((change) => change.phase === phase).length,
    ]),
  ]);
}

export function sortChanges(
  changes: readonly ChangeView[],
  sort: InboxSort,
  lang: Lang,
): readonly ChangeView[] {
  const since = (change: ChangeView) => Date.parse(change.phaseSince);
  const size = (change: ChangeView) => (change.size ? SIZE[change.size.level] : 0);
  const compare: Readonly<Record<InboxSort, (a: ChangeView, b: ChangeView) => number>> = {
    // What has waited longest first.
    waiting: (a, b) => since(a) - since(b),
    recent: (a, b) => since(b) - since(a),
    title: (a, b) => a.title.localeCompare(b.title, lang, { sensitivity: "base" }),
    size: (a, b) => size(b) - size(a) || since(a) - since(b),
  };
  return changes.toSorted(compare[sort]);
}

/** The sections of the Inbox, sorted inside, without empty ones. */
export function inboxSections(
  changes: readonly ChangeView[],
  filters: InboxFilters,
  lang: Lang,
): readonly InboxSection[] {
  const shown = sortChanges(visibleChanges(changes, filters), filters.sort, lang);
  const sections: readonly InboxSection[] =
    filters.group === "state"
      ? STATES.map(({ key, label }) => ({
          key,
          label,
          changes: shown.filter((change) => stateOf(change) === key),
        }))
      : filters.group === "phase"
        ? PHASES.map((phase) => ({
            key: phase,
            label: PHASE_LABELS[phase],
            changes: shown.filter((change) => change.phase === phase),
          }))
        : [{ key: "all", label: { es: "Todos los cambios", en: "All changes" }, changes: shown }];
  return sections.filter((section) => section.changes.length > 0);
}
