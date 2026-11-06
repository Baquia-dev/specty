// SPDX-License-Identifier: Apache-2.0
// What the Inbox shows, from the changes listed: filtered, grouped and sorted. Pure.
import type { ChangeKind } from "@baquia-dev/specty-core";
import {
  CHANGE_SORTS,
  type ChangeSort,
  type Lang,
  matchesQuery,
  PHASES,
  type Phase,
  sortChanges,
} from "@baquia-dev/specty-core/light";
import type { Bilingual, ListedChange } from "../data/records";
import { PHASE_LABELS } from "../theme/tokens";

export type InboxGroup = "state" | "phase" | "none" | "epic";
/** The Inbox sorts as the local server does its pages of finished changes. */
export type InboxSort = ChangeSort;
export type InboxPhase = Phase | "all";

export const INBOX_GROUPS: readonly InboxGroup[] = ["state", "phase", "none", "epic"];
export const INBOX_SORTS: readonly InboxSort[] = CHANGE_SORTS;

export interface InboxFilters {
  readonly query: string;
  readonly phase: InboxPhase;
  readonly group: InboxGroup;
  readonly sort: InboxSort;
}

/**
 * A block of the Inbox: a change of its own, or a loaded epic with all its loaded slices, whatever
 * their state, which goes to a single section. The changes are as they were given: summaries,
 * whole views or both.
 */
export type InboxBlock<T extends ListedChange = ListedChange> =
  | { readonly kind: "row"; readonly key: string; readonly change: T }
  | {
      readonly kind: "epic";
      readonly key: string;
      /** The epic: its own row heads the block. */
      readonly epic: T;
      /** Its slices loaded, in the order chosen. */
      readonly slices: readonly T[];
    };

/** A section of the Inbox: its blocks, which it counts, and every change in them. */
export interface InboxSection<T extends ListedChange = ListedChange> {
  readonly key: string;
  readonly label: Bilingual;
  readonly blocks: readonly InboxBlock<T>[];
  /** In the order chosen: each row, or the epic and then its slices loaded. */
  readonly order: readonly T[];
}

/** Waiting for the person, in progress, or finished. */
export type InboxState = "decision" | "active" | "recent";

const STATES: readonly { readonly key: InboxState; readonly label: Bilingual }[] = [
  { key: "decision", label: { es: "Esperan tu decisión", en: "Waiting for your decision" } },
  { key: "active", label: { es: "En curso", en: "In progress" } },
  { key: "recent", label: { es: "Recientes", en: "Recent" } },
];

const KIND_SECTIONS: readonly { readonly key: ChangeKind; readonly label: Bilingual }[] = [
  { key: "standard", label: { es: "Features", en: "Features" } },
  { key: "quick", label: { es: "Cambios quick", en: "Quick changes" } },
  { key: "retro", label: { es: "Cambios manuales", en: "Manual changes" } },
  { key: "spike", label: { es: "Spikes", en: "Spikes" } },
];

export function stateOf(change: ListedChange): InboxState {
  if (change.decision !== undefined) return "decision";
  return change.phase === "done" || change.phase === "cancelled" ? "recent" : "active";
}

/** The changes the search and the phase filter let through. */
export function visibleChanges<T extends ListedChange>(
  changes: readonly T[],
  filters: Pick<InboxFilters, "query" | "phase">,
): readonly T[] {
  return changes.filter((change) => passes(change, filters));
}

function passes(change: ListedChange, filters: Pick<InboxFilters, "query" | "phase">): boolean {
  return (
    matchesQuery(change, filters.query) &&
    (filters.phase === "all" || change.phase === filters.phase)
  );
}

/** How many changes of each phase the search lets through, for the phase filters. */
export function phaseCounts(
  changes: readonly ListedChange[],
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

/**
 * The sections of the Inbox, sorted inside, without empty ones. The open changes go before the
 * finished ones, each part in the order chosen, so a new page of finished changes goes at the end
 * of what is shown (A4 of the epic `20261105-bandeja-por-paginas`). Each epic goes once, with all
 * its slices, where its block goes: the filters let it through if they let any of them through.
 */
export function inboxSections<T extends ListedChange>(
  changes: readonly T[],
  filters: InboxFilters,
  lang: Lang,
): readonly InboxSection<T>[] {
  const sorted = (finished: boolean) =>
    sortChanges(
      changes.filter((change) => (stateOf(change) === "recent") === finished),
      filters.sort,
      lang,
    );
  const shown = blocksOf([...sorted(false), ...sorted(true)]).filter((block) =>
    membersOf(block).some((change) => passes(change, filters)),
  );
  const sections: readonly InboxSection<T>[] =
    filters.group === "epic"
      ? epicSections(shown)
      : filters.group === "state"
        ? STATES.map(({ key, label }) =>
            section(
              key,
              label,
              shown.filter((block) => blockState(block) === key),
            ),
          )
        : filters.group === "phase"
          ? PHASES.map((phase) =>
              section(
                phase,
                PHASE_LABELS[phase],
                shown.filter((block) => leadOf(block).phase === phase),
              ),
            )
          : [section("all", { es: "Todos los cambios", en: "All changes" }, shown)];
  return sections.filter((item) => item.blocks.length > 0);
}

/**
 * The blocks of `changes`, in their order: each loaded epic with every slice of it, where its first
 * member goes, and each other change as a row. A slice whose epic is not loaded is a row.
 */
function blocksOf<T extends ListedChange>(changes: readonly T[]): readonly InboxBlock<T>[] {
  const epics = new Map(
    changes.flatMap((c): [string, T][] => (c.kind === "epic" ? [[c.id, c]] : [])),
  );
  const home = (change: T) =>
    change.epic !== undefined && epics.has(change.epic.id) ? change.epic.id : change.id;
  const seen = new Set<string>();
  return changes.flatMap((change): InboxBlock<T>[] => {
    const key = home(change);
    if (seen.has(key)) return [];
    seen.add(key);
    const epic = epics.get(key);
    if (epic === undefined) return [{ kind: "row", key, change }];
    const slices = changes.filter((item) => item !== epic && home(item) === key);
    return [{ kind: "epic", key: `epic-${key}`, epic, slices }];
  });
}

function section<T extends ListedChange>(
  key: string,
  label: Bilingual,
  blocks: readonly InboxBlock<T>[],
): InboxSection<T> {
  return { key, label, blocks, order: blocks.flatMap(membersOf) };
}

/** A row's change, or an epic and then its slices. */
function membersOf<T extends ListedChange>(block: InboxBlock<T>): readonly T[] {
  return block.kind === "row" ? [block.change] : [block.epic, ...block.slices];
}

/** The change that leads a block: its row, or its epic. */
function leadOf<T extends ListedChange>(block: InboxBlock<T>): T {
  return block.kind === "row" ? block.change : block.epic;
}

/** The most urgent state among a block's members: a decision, then in progress, then recent. */
function blockState(block: InboxBlock): InboxState {
  const states = new Set(membersOf(block).map(stateOf));
  return STATES.find(({ key }) => states.has(key))?.key ?? "recent";
}

/**
 * One section per epic, in the order of the blocks, and then one per kind. The slices whose epic
 * is not loaded go, as rows, to their epic's section, with the title of the epic they bring.
 */
function epicSections<T extends ListedChange>(
  blocks: readonly InboxBlock<T>[],
): readonly InboxSection<T>[] {
  const epicOf = (block: InboxBlock<T>) => (block.kind === "epic" ? block.epic : block.change.epic);
  const epicIds = [...new Set(blocks.flatMap((block) => epicOf(block)?.id ?? []))];
  const byEpic = epicIds.map((epicId) => {
    const group = blocks.filter((block) => epicOf(block)?.id === epicId);
    const title = group.map(epicOf).find((epic) => epic !== undefined)?.title ?? epicId;
    return section(`epic:${epicId}`, { es: `Épica · ${title}`, en: `Epic · ${title}` }, group);
  });
  const rest = blocks.filter((block) => epicOf(block) === undefined);
  const byKind = KIND_SECTIONS.map(({ key, label }) =>
    section(
      key,
      label,
      rest.filter((block) => leadOf(block).kind === key),
    ),
  );
  return [...byEpic, ...byKind];
}
