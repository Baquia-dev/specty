// SPDX-License-Identifier: Apache-2.0
// The panel's «Coste y tokens» (docs/ui.md, «Panel»): what the changes of a period cost, as
// ccusage measured it on closing them, day by day or week by week, by lane and by change, and
// the tokens of each type they spent, each by the day of its `change.usage`.
import { CHANGE_KINDS, type ChangeKind } from "../spec/model";
import { addDays, inRange, type StatsRange, sum } from "./period";
import type { StatsRhythm } from "./rhythm";
import type { StatsRow } from "./rows";

/** At most this many changes in the list of those that cost the most. */
const TOP = 5;

/** What the changes of a period cost, and in what. */
export interface StatsCost {
  readonly unit: StatsRhythm["unit"];
  /** The US dollars measured in each day or week of the rhythm. */
  readonly buckets: readonly {
    readonly from: string;
    readonly to: string;
    readonly cost: number;
  }[];
  /**
   * The tokens of each type and the calls to the model of every `change.usage` of the period,
   * with a cost or without, and on how many changes.
   */
  readonly tokens: {
    readonly input: number;
    readonly output: number;
    readonly cacheWrite: number;
    readonly cacheRead: number;
    readonly calls: number;
    readonly changes: number;
  };
  /** The cost of each lane with one, the most first, and on how many changes it was measured. */
  readonly lanes: readonly {
    readonly kind: ChangeKind;
    readonly cost: number;
    readonly changes: number;
  }[];
  /**
   * The changes that cost the most in the period, the most first: the cost of the period, and
   * the tasks completed, the milliseconds from created to closed (none while open) and the
   * distinct agent sessions of the whole change (none when no line of it tells its session).
   */
  readonly top: readonly {
    readonly id: string;
    readonly kind: ChangeKind;
    readonly cost: number;
    readonly tasks: number;
    readonly cycle: number | null;
    readonly sessions: number | null;
  }[];
}

/** The cost of `rows` in `range`, by the days or weeks of `rhythm`. */
export function statsCost(
  rows: readonly StatsRow[],
  range: StatsRange,
  rhythm: StatsRhythm,
): StatsCost {
  const spent = rows.flatMap((row) => {
    const own = row.costs.filter((one) => inRange(one.day, range));
    return own.length === 0 ? [] : [{ row, cost: sum(own.map((one) => one.cost)) }];
  });
  return {
    unit: rhythm.unit,
    buckets: bucketsOf(
      rows.flatMap((row) => row.costs.filter((one) => inRange(one.day, range))),
      rhythm,
    ),
    tokens: tokensOf(rows, range),
    lanes: lanesOf(spent),
    top: spent
      .toSorted((one, other) => other.cost - one.cost || one.row.id.localeCompare(other.row.id))
      .slice(0, TOP)
      .map(({ row, cost }) => ({
        id: row.id,
        kind: row.kind,
        cost,
        tasks: row.tasks.length,
        cycle: row.closed === undefined ? null : Date.parse(row.closed) - Date.parse(row.created),
        sessions:
          row.sessions.length === 0
            ? null
            : new Set(row.sessions.map((session) => session.id)).size,
      })),
  };
}

/** The cost of each of the rhythm's days or weeks. */
function bucketsOf(
  costs: readonly { readonly day: string; readonly cost: number }[],
  rhythm: StatsRhythm,
): StatsCost["buckets"] {
  const buckets = rhythm.buckets.map(({ from, to }) => ({ from, to, cost: 0 }));
  const byDay = new Map<string, (typeof buckets)[number]>();
  for (const bucket of buckets) {
    for (let day = bucket.from; day <= bucket.to; day = addDays(day, 1)) byDay.set(day, bucket);
  }
  for (const one of costs) {
    const bucket = byDay.get(one.day);
    if (bucket !== undefined) bucket.cost += one.cost;
  }
  return buckets;
}

/** The tokens and calls of every usage of `rows` in `range`, and how many changes had one. */
function tokensOf(rows: readonly StatsRow[], range: StatsRange): StatsCost["tokens"] {
  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, calls: 0, changes: 0 };
  for (const row of rows) {
    const own = row.usage.filter((one) => inRange(one.day, range));
    if (own.length > 0) tokens.changes += 1;
    for (const one of own) {
      tokens.input += one.input;
      tokens.output += one.output;
      tokens.cacheWrite += one.cacheWrite;
      tokens.cacheRead += one.cacheRead;
      tokens.calls += one.calls;
    }
  }
  return tokens;
}

/** The lanes of the changes with a cost: the most first, then in the lanes' own order. */
function lanesOf(
  spent: readonly { readonly row: StatsRow; readonly cost: number }[],
): StatsCost["lanes"] {
  return CHANGE_KINDS.map((kind) => {
    const own = spent.filter((one) => one.row.kind === kind);
    return { kind, cost: sum(own.map((one) => one.cost)), changes: own.length };
  })
    .filter((lane) => lane.changes > 0)
    .toSorted((one, other) => other.cost - one.cost);
}
