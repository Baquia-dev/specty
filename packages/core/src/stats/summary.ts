// SPDX-License-Identifier: Apache-2.0
// The panel of `specty ui` (docs/ui.md, «Panel»): the six figures of a cut, compared with the
// period before, and what the page needs around them. The local server answers it as
// `GET /api/stats`; the other sections of the panel join `StatsView` as they come.
import type { MemoryEntry } from "../memory/entries";
import { type StatsCost, statsCost } from "./cost";
import {
  addedUp,
  bucketCounts,
  type OwnCounts,
  ownCounts,
  type PeriodCounts,
  periodCounts,
  perWho,
} from "./counts";
import { type StatsFlow, statsFlow } from "./flow";
import { type StatsMemory, statsMemory } from "./memory";
import { type StatsPeopleRow, statsPeople } from "./people";
import {
  compared,
  dayOf,
  inCut,
  type StatsQuery,
  type StatsRange,
  type StatsWho,
  statsRanges,
} from "./period";
import { type StatsQuality, statsQuality } from "./quality";
import { type StatsRhythm, statsRhythm } from "./rhythm";
import type { StatsRow } from "./rows";
import { type StatsScope, statsScope } from "./scope";

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
  /**
   * «Flujo y esperas»: the time of each phase, who approved, the wait and the sessions. It and
   * «Calidad» may be given as undefined, as a source that builds its answer does.
   */
  readonly flow?: StatsFlow | undefined;
  /** «Calidad»: the task verifications by the rhythm's days or weeks, and what Specty checked. */
  readonly quality?: StatsQuality | undefined;
  /** «Coste y tokens»: the cost by the rhythm's buckets, by lane and by change; the tokens. */
  readonly cost?: StatsCost | undefined;
  /**
   * «Alcance e integraciones»: the scope requests decided, the merges of main that stopped and
   * the adjustments asked for.
   */
  readonly scope?: StatsScope | undefined;
  /** «Memoria»: the entries of the cut noted in the period, by status and by kind. */
  readonly memory?: StatsMemory | undefined;
  /**
   * The six figures in each day or week of «Ritmo», for the minigraphs of the first row: each
   * counted as the period counts it, none where nothing in that day or week measures it.
   */
  readonly trend?:
    | {
        readonly unit: StatsRhythm["unit"];
        readonly buckets: readonly {
          readonly from: string;
          readonly to: string;
          readonly closed: number;
          readonly tasks: number;
          /** The median milliseconds from created to closed of the changes closed in it. */
          readonly cycle: number | null;
          /** The share of task verifications that passed in it, from 0 to 1. */
          readonly verifications: number | null;
          /** The US dollars measured in it. */
          readonly cost: number | null;
          /** Pending items, improvements and reminders open at its end. */
          readonly pending: number;
        }[];
      }
    | undefined;
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
  const rhythm = statsRhythm(cut, current);
  const waiting = waitingOf(entries);
  // What each change of the lane did in the period, counted once: the summary adds up those of
  // the cut, and «Personas y agentes» those of each person, agent and model.
  const own = ownCounts(lane, current);
  return {
    query,
    range: current,
    ...(previous === undefined ? {} : { previous }),
    changes: lived.length,
    options: perWho(rows, (who, theirs) => ({ who, changes: theirs.length })),
    summary: summaryOf(cut, waiting, { range: current, own }, previous),
    rhythm,
    people: statsPeople(lane, current, own),
    flow: statsFlow(cut, current),
    quality: statsQuality(cut, current, rhythm),
    cost: statsCost(cut, current, rhythm),
    scope: statsScope(cut, current),
    memory: statsMemory(entries, current),
    trend: trendOf(cut, waiting, rhythm),
  };
}

/**
 * The figures of `rows` and of the `waiting` entries in each day or week of `rhythm`, as the
 * period counts them: all of them in one pass over the changes.
 */
function trendOf(
  rows: readonly StatsRow[],
  waiting: readonly Waiting[],
  rhythm: StatsRhythm,
): NonNullable<StatsView["trend"]> {
  return {
    unit: rhythm.unit,
    buckets: bucketCounts(rows, rhythm.buckets).map((counts) => ({
      from: counts.from,
      to: counts.to,
      closed: counts.closed,
      tasks: counts.tasks,
      cycle: counts.cycle,
      verifications: counts.passing,
      cost: counts.cost,
      pending: pendingAt(waiting, counts.to),
    })),
  };
}

/**
 * The figures of `rows` and of the `waiting` entries in `period.range`, each compared with
 * `before` if there is one; `period.own` has what each of `rows` did in it.
 */
function summaryOf(
  rows: readonly StatsRow[],
  waiting: readonly Waiting[],
  period: { readonly range: StatsRange; readonly own: ReadonlyMap<StatsRow, OwnCounts> },
  before: StatsRange | undefined,
): StatsSummary {
  const now = { ...addedUp(rows, period.own), pending: pendingAt(waiting, period.range.to) };
  const then = before === undefined ? undefined : countsOf(rows, waiting, before);
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

/** What a period counts, before it is compared: what its changes did and the pending entries. */
interface Counts extends PeriodCounts {
  readonly pending: number;
}

function countsOf(
  rows: readonly StatsRow[],
  waiting: readonly Waiting[],
  range: StatsRange,
): Counts {
  return { ...periodCounts(rows, range), pending: pendingAt(waiting, range.to) };
}

/** The kinds of entry that wait to be done: not decisions nor lessons. */
const WAITING: ReadonlySet<MemoryEntry["kind"]> = new Set(["pending", "improvement", "reminder"]);

/** An entry that waits to be done: the day it was noted and the day it was done or dropped. */
interface Waiting {
  readonly from: string;
  /** None while it is not done nor dropped. */
  readonly until?: string;
}

/**
 * The entries of `memory` that wait to be done, with their days, each read once and not once per
 * period. One done or dropped with no date has been closed since it was created: none of them.
 */
function waitingOf(memory: readonly MemoryEntry[]): readonly Waiting[] {
  return memory.flatMap((entry) => {
    if (!WAITING.has(entry.kind)) return [];
    const from = dayOf(entry.created);
    if (entry.status !== "done" && entry.status !== "dropped") return [{ from }];
    return entry.closed === undefined ? [] : [{ from, until: dayOf(entry.closed.at) }];
  });
}

/** How many of the `waiting` entries were open at the end of `day`: created, not yet closed. */
function pendingAt(waiting: readonly Waiting[], day: string): number {
  return waiting.filter((one) => one.from <= day && (one.until === undefined || one.until > day))
    .length;
}
