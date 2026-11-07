// SPDX-License-Identifier: Apache-2.0
// The panel of `specty ui` (docs/ui.md, «Panel»): the six figures of a cut, compared with the
// period before, and what the page needs around them. The local server answers it as
// `GET /api/stats`; the other sections of the panel join `StatsView` as they come.
import type { MemoryEntry } from "../memory/entries";
import { type StatsPeopleRow, statsPeople } from "./people";
import {
  compared,
  dayOf,
  inCut,
  inRange,
  median,
  type StatsQuery,
  type StatsRange,
  type StatsWho,
  type StatsWhoKind,
  statsRanges,
  sum,
} from "./period";
import { type StatsRhythm, statsRhythm } from "./rhythm";
import type { StatsRow } from "./rows";

/**
 * A figure of the period: its value, none when nothing measures it, and, unless the period is
 * «all», its value in the period before and the change, null when that one has no data.
 */
export interface StatsFigure {
  readonly value: number | null;
  readonly previous?: number | null;
  readonly change?: number | null;
}

/** The six figures of the panel's first row. */
export interface StatsSummary {
  /** Changes closed in the period. */
  readonly closed: StatsFigure;
  /** Tasks completed in the period. */
  readonly tasks: StatsFigure;
  /** The median milliseconds from created to closed of the changes closed in the period. */
  readonly cycle: StatsFigure;
  /** The share of task verifications that passed, from 0 to 1, and how many there were. */
  readonly verifications: StatsFigure & { readonly count: number };
  /** The US dollars measured, on how many changes, of how many closed in the period. */
  readonly cost: StatsFigure & { readonly measured: number; readonly of: number };
  /** Pending items, improvements and reminders open at the end of the period. */
  readonly pending: StatsFigure;
}

/** Someone the panel can be cut by, and how many changes count for them. */
export interface StatsOption {
  readonly who: StatsWho;
  readonly changes: number;
}

/** The panel of a cut, as `GET /api/stats` gives it. */
export interface StatsView {
  /** The cut it shows: the one asked for, each value understood or its default. */
  readonly query: StatsQuery;
  readonly range: StatsRange;
  /** The period before, of the same length; none with «all». */
  readonly previous?: StatsRange;
  /** The changes of the cut that lived in the period: with none, the panel is empty. */
  readonly changes: number;
  /** Each person, agent and model, «(sin dato)» too, the ones with most changes first. */
  readonly options: readonly StatsOption[];
  readonly summary: StatsSummary;
  /**
   * «Ritmo»: the changes of the cut closed by lane, and its tasks, by day or by week. Like the
   * other sections, optional: a source that does not give it yet shows the rest of the panel.
   */
  readonly rhythm?: StatsRhythm;
  /** «Personas y agentes»: a row per person, agent and model of the lane, whoever the cut is for. */
  readonly people?: readonly StatsPeopleRow[];
}

/** What the panel is made of: every change's row, the memory's entries and the local today. */
interface StatsInput {
  readonly rows: readonly StatsRow[];
  readonly memory: readonly MemoryEntry[];
  /** YYYY-MM-DD, local. */
  readonly today: string;
  readonly query: StatsQuery;
}

/**
 * The panel of `query`'s cut, from every change and the memory. With a filter, a memory entry
 * counts when it was noted in a change of the cut (`origin.change`).
 */
export function statsView({ rows, memory, today, query }: StatsInput): StatsView {
  const first = rows.reduce((day, row) => (row.lived.from < day ? row.lived.from : day), today);
  const { current, previous } = statsRanges(query.period, today, first);
  const cut = rows.filter((row) => inCut(row, query));
  const lane = rows.filter((row) => query.kind === undefined || row.kind === query.kind);
  const ids = new Set(cut.map((row) => row.id));
  const filtered = query.who !== undefined || query.kind !== undefined;
  const entries = filtered ? memory.filter((entry) => ids.has(entry.origin.change ?? "")) : memory;
  const lived = cut.filter((row) => row.lived.from <= current.to && row.lived.to >= current.from);
  return {
    query,
    range: current,
    ...(previous === undefined ? {} : { previous }),
    changes: lived.length,
    options: optionsOf(rows),
    summary: summaryOf(cut, entries, current, previous),
    rhythm: statsRhythm(cut, current),
    people: statsPeople(lane, current),
  };
}

/** The figures of `rows` and `memory` in `range`, each compared with `before` if there is one. */
function summaryOf(
  rows: readonly StatsRow[],
  memory: readonly MemoryEntry[],
  range: StatsRange,
  before: StatsRange | undefined,
): StatsSummary {
  const now = countsOf(rows, memory, range);
  const then = before === undefined ? undefined : countsOf(rows, memory, before);
  const figure = (pick: (counts: Counts) => number | null): StatsFigure => {
    const value = pick(now);
    return then === undefined ? { value } : { value, ...compared(value, pick(then)) };
  };
  return {
    closed: figure((counts) => counts.closed),
    tasks: figure((counts) => counts.tasks),
    cycle: figure((counts) => counts.cycle),
    verifications: { ...figure((counts) => counts.passing), count: now.verifications },
    cost: { ...figure((counts) => counts.cost), measured: now.measured, of: now.closed },
    pending: figure((counts) => counts.pending),
  };
}

/** What a period counts, before it is compared. */
interface Counts {
  readonly closed: number;
  readonly tasks: number;
  readonly cycle: number | null;
  readonly verifications: number;
  readonly passing: number | null;
  readonly cost: number | null;
  readonly measured: number;
  readonly pending: number;
}

function countsOf(
  rows: readonly StatsRow[],
  memory: readonly MemoryEntry[],
  range: StatsRange,
): Counts {
  const closed = rows.flatMap((row) =>
    row.closed !== undefined && inRange(dayOf(row.closed), range)
      ? [Date.parse(row.closed) - Date.parse(row.created)]
      : [],
  );
  const verified = rows.flatMap((row) =>
    row.verifications.filter((one) => inRange(one.day, range)),
  );
  const costs = rows.flatMap((row) => {
    const own = row.costs.filter((one) => inRange(one.day, range));
    return own.length === 0 ? [] : [sum(own.map((one) => one.cost))];
  });
  const passed = verified.filter((one) => one.passed).length;
  return {
    closed: closed.length,
    tasks: sum(rows.map((row) => row.tasks.filter((day) => inRange(day, range)).length)),
    cycle: median(closed),
    verifications: verified.length,
    passing: verified.length === 0 ? null : passed / verified.length,
    cost: costs.length === 0 ? null : sum(costs),
    measured: costs.length,
    pending: memory.filter((entry) => openAt(entry, range.to)).length,
  };
}

/** The kinds of entry that wait to be done: not decisions nor lessons. */
const WAITING: ReadonlySet<MemoryEntry["kind"]> = new Set(["pending", "improvement", "reminder"]);

/** An entry that waits to be done, created by `day` and not yet done nor dropped then. */
function openAt(entry: MemoryEntry, day: string): boolean {
  if (!WAITING.has(entry.kind) || dayOf(entry.created) > day) return false;
  if (entry.status !== "done" && entry.status !== "dropped") return true;
  // Done or dropped with no date: closed since it was created.
  return entry.closed !== undefined && dayOf(entry.closed.at) > day;
}

const WHO_KINDS: readonly StatsWhoKind[] = ["person", "agent", "model"];

/**
 * Each person, agent and model of `rows`, with how many changes count for each: by kind, the most
 * changes first, then by name, and «(sin dato)», an empty name, last of its kind.
 */
function optionsOf(rows: readonly StatsRow[]): StatsOption[] {
  return WHO_KINDS.flatMap((kind) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = row[kind] ?? "";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts]
      .toSorted(
        ([one, many], [other, more]) =>
          Number(one === "") - Number(other === "") || more - many || one.localeCompare(other),
      )
      .map(([name, changes]) => ({ who: { kind, name }, changes }));
  });
}
