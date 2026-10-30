// SPDX-License-Identifier: Apache-2.0
// What the Inbox shows, from the change views: filtered, grouped and sorted. Pure.
import type { ChangeKind, SizeLevel } from "@baquia-dev/specty-core";
import { type Lang, PHASES, type Phase } from "@baquia-dev/specty-core/light";
import type { Bilingual, ChangeView } from "../data/records";
import { PHASE_LABELS } from "../theme/tokens";

export type InboxGroup = "state" | "phase" | "none" | "epic";
export type InboxSort = "waiting" | "recent" | "title" | "size";
export type InboxPhase = Phase | "all";

export const INBOX_GROUPS: readonly InboxGroup[] = ["state", "phase", "none", "epic"];
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

export type InboxBlock =
  | { readonly kind: "row"; readonly key: string; readonly change: ChangeView }
  | {
      readonly kind: "epic";
      readonly key: string;
      readonly epicId: string;
      readonly title: string;
      readonly changes: readonly ChangeView[];
    };

/** Waiting for the person, in progress, or finished. */
export type InboxState = "decision" | "active" | "recent";

const STATES: readonly { readonly key: InboxState; readonly label: Bilingual }[] = [
  { key: "decision", label: { es: "Esperan tu decisión", en: "Waiting for your decision" } },
  { key: "active", label: { es: "En curso", en: "In progress" } },
  { key: "recent", label: { es: "Recientes", en: "Recent" } },
];

const KIND_SECTIONS: readonly { readonly key: ChangeKind; readonly label: Bilingual }[] = [
  { key: "standard", label: { es: "Specs individuales", en: "Standalone specs" } },
  { key: "quick", label: { es: "Cambios quick", en: "Quick changes" } },
  { key: "retro", label: { es: "Cambios manuales", en: "Manual changes" } },
  { key: "spike", label: { es: "Spikes", en: "Spikes" } },
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

/** Whether the title, id or epic metadata contain the query, ignoring case and accents. */
export function matchesQuery(change: ChangeView, query: string): boolean {
  const wanted = folded(query.trim());
  if (wanted === "") return true;
  const fields = [
    change.title,
    change.id,
    change.epic?.title ?? "",
    change.epic?.id ?? "",
    change.epic?.slice ?? "",
  ];
  return fields.some((field) => folded(field).includes(wanted));
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
    filters.group === "epic"
      ? epicSections(shown, changes)
      : filters.group === "state"
        ? STATES.map(({ key, label }) => ({
            key,
            label,
            changes: clusterByEpic(shown.filter((change) => stateOf(change) === key)),
          }))
        : filters.group === "phase"
          ? PHASES.map((phase) => ({
              key: phase,
              label: PHASE_LABELS[phase],
              changes: clusterByEpic(shown.filter((change) => change.phase === phase)),
            }))
          : [
              {
                key: "all",
                label: { es: "Todos los cambios", en: "All changes" },
                changes: clusterByEpic(shown),
              },
            ];
  return sections.filter((section) => section.changes.length > 0);
}

/** Visual blocks inside a section: changes of the same epic grouped together, others as rows. */
export function sectionBlocks(section: InboxSection): readonly InboxBlock[] {
  const sliceEpics = new Set(section.changes.flatMap((c) => (c.epic ? [c.epic.id] : [])));
  const seen = new Set<string>();
  return section.changes.flatMap((change): InboxBlock[] => {
    const epicId = epicClusterId(change, sliceEpics);
    if (epicId === undefined) return [{ kind: "row", key: change.id, change }];
    if (seen.has(epicId)) return [];
    seen.add(epicId);
    const group = section.changes.filter((item) => epicClusterId(item, sliceEpics) === epicId);
    const title =
      group.find((item) => item.kind === "epic")?.title ??
      group.find((item) => item.epic !== undefined)?.epic?.title ??
      epicId;
    return [{ kind: "epic", key: `epic-${epicId}`, epicId, title, changes: group }];
  });
}

function epicClusterId(change: ChangeView, sliceEpics: ReadonlySet<string>): string | undefined {
  if (change.epic !== undefined) return change.epic.id;
  return change.kind === "epic" && sliceEpics.has(change.id) ? change.id : undefined;
}

function clusterByEpic(changes: readonly ChangeView[]): readonly ChangeView[] {
  const sliceEpics = new Set(changes.flatMap((c) => (c.epic ? [c.epic.id] : [])));
  const seen = new Set<string>();
  return changes.flatMap((change) => {
    const epicId = epicClusterId(change, sliceEpics);
    if (epicId === undefined) return [change];
    if (seen.has(epicId)) return [];
    seen.add(epicId);
    return changes
      .filter((item) => epicClusterId(item, sliceEpics) === epicId)
      .toSorted((a, b) => Number(b.kind === "epic") - Number(a.kind === "epic"));
  });
}

function epicSections(
  shown: readonly ChangeView[],
  all: readonly ChangeView[],
): readonly InboxSection[] {
  const epicOf = (c: ChangeView) => (c.kind === "epic" ? c.id : c.epic?.id);
  const epicIds = [...new Set(shown.flatMap((c) => (epicOf(c) ? [epicOf(c) ?? ""] : [])))];
  const byEpic: InboxSection[] = epicIds.map((epicId) => {
    const group = shown
      .filter((c) => epicOf(c) === epicId)
      .toSorted((a, b) => Number(b.kind === "epic") - Number(a.kind === "epic"));
    const title =
      all.find((c) => c.id === epicId)?.title ??
      group.find((c) => c.epic !== undefined)?.epic?.title ??
      epicId;
    return {
      key: `epic:${epicId}`,
      label: { es: `Épica · ${title}`, en: `Epic · ${title}` },
      changes: group,
    };
  });
  const rest = shown.filter((c) => epicOf(c) === undefined);
  const byKind: InboxSection[] = KIND_SECTIONS.map(({ key, label }) => ({
    key,
    label,
    changes: rest.filter((c) => c.kind === key),
  }));
  return [...byEpic, ...byKind];
}
