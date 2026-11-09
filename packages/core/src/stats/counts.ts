// SPDX-License-Identifier: Apache-2.0
// How the panel (docs/ui.md, «Panel») counts what some changes did in a period, and how it lists
// people, agents and models: the first row's figures and «Personas y agentes» count the cycle, the
// verifications and the cost with it, and order by changes with it, so their figures agree.
import { inRange, median, rangeFinder, type StatsRange, type StatsWho, WHO_KINDS } from "./period";
import type { StatsRow } from "./rows";

/** What some changes did in a period. */
export interface PeriodCounts {
  /** Their changes closed in it. */
  readonly closed: number;
  /** The tasks completed in it. */
  readonly tasks: number;
  /** The median milliseconds from created to closed of those closed in it; none without any. */
  readonly cycle: number | null;
  /** Their task verifications in it. */
  readonly verifications: number;
  /** The share of those that passed, from 0 to 1; none without any. */
  readonly passing: number | null;
  /** The US dollars measured in it; none when nothing was. */
  readonly cost: number | null;
  /** On how many of the changes a cost was measured in it. */
  readonly measured: number;
}

/** What `rows` did in `range`, each fact by the local day of its event. */
export function periodCounts(rows: readonly StatsRow[], range: StatsRange): PeriodCounts {
  const tally = noneCounted();
  const tallyOf = (day: string) => (inRange(day, range) ? tally : undefined);
  for (const row of rows) count(row, tallyOf);
  return countsOf(tally);
}

/** What one change did in a period, to add it up with others' with `addedUp`. */
export type OwnCounts = Readonly<Tally>;

/**
 * What each of `rows` did in `range` on its own: to count each person, agent and model by adding
 * up their changes', going through the facts of each change once and not once per group.
 */
export function ownCounts(
  rows: readonly StatsRow[],
  range: StatsRange,
): ReadonlyMap<StatsRow, OwnCounts> {
  const own = new Map<StatsRow, OwnCounts>();
  for (const row of rows) {
    const tally = noneCounted();
    count(row, (day) => (inRange(day, range) ? tally : undefined));
    own.set(row, tally);
  }
  return own;
}

/**
 * What `rows` did in the period of `own`, from what each did on its own: the same figures as
 * `periodCounts`, the dollars added in the same order.
 */
export function addedUp(
  rows: readonly StatsRow[],
  own: ReadonlyMap<StatsRow, OwnCounts>,
): PeriodCounts {
  const total = noneCounted();
  for (const row of rows) {
    const tally = own.get(row);
    if (tally === undefined) continue;
    total.cycles.push(...tally.cycles);
    total.tasks += tally.tasks;
    total.verifications += tally.verifications;
    total.passed += tally.passed;
    total.cost += tally.cost;
    total.measured += tally.measured;
  }
  return countsOf(total);
}

/**
 * What `rows` did in each of `buckets`, days or weeks in order and none over another, as
 * `periodCounts` counts each: going through the changes once, and not once per bucket.
 */
export function bucketCounts(
  rows: readonly StatsRow[],
  buckets: readonly StatsRange[],
): (StatsRange & PeriodCounts)[] {
  const counted = buckets.map(({ from, to }) => ({ from, to, tally: noneCounted() }));
  const find = rangeFinder(counted);
  const tallyOf = (day: string) => counted[find(day)]?.tally;
  for (const row of rows) count(row, tallyOf);
  return counted.map(({ from, to, tally }) => ({ from, to, ...countsOf(tally) }));
}

/** What a period, or a day or week of one, counts while going through the changes. */
interface Tally {
  readonly cycles: number[];
  tasks: number;
  verifications: number;
  passed: number;
  cost: number;
  measured: number;
}

function noneCounted(): Tally {
  return { cycles: [], tasks: 0, verifications: 0, passed: 0, cost: 0, measured: 0 };
}

/** Counts each fact of `row` in the tally of its day, if `tallyOf` gives one for it. */
function count(row: StatsRow, tallyOf: (day: string) => Tally | undefined): void {
  const closing = row.closedDay === undefined ? undefined : tallyOf(row.closedDay);
  if (closing !== undefined && row.closed !== undefined)
    closing.cycles.push(Date.parse(row.closed) - Date.parse(row.created));
  for (const day of row.tasks) {
    const tally = tallyOf(day);
    if (tally !== undefined) tally.tasks += 1;
  }
  for (const one of row.verifications) {
    const tally = tallyOf(one.day);
    if (tally === undefined) continue;
    tally.verifications += 1;
    if (one.passed) tally.passed += 1;
  }
  costsOf(row, tallyOf);
}

/**
 * Adds the costs of `row` to the tally of each one's day: first the change's own in each tally
 * and then that to the tally, in the order the figures have always summed them.
 */
function costsOf(row: StatsRow, tallyOf: (day: string) => Tally | undefined): void {
  if (row.costs.length === 0) return;
  const own = new Map<Tally, number>();
  for (const one of row.costs) {
    const tally = tallyOf(one.day);
    if (tally !== undefined) own.set(tally, (own.get(tally) ?? 0) + one.cost);
  }
  for (const [tally, cost] of own) {
    tally.cost += cost;
    tally.measured += 1;
  }
}

/** What a tally counted, as the figures give it. */
function countsOf(tally: Tally): PeriodCounts {
  return {
    closed: tally.cycles.length,
    tasks: tally.tasks,
    cycle: median(tally.cycles),
    verifications: tally.verifications,
    passing: tally.verifications === 0 ? null : tally.passed / tally.verifications,
    cost: tally.measured === 0 ? null : tally.cost,
    measured: tally.measured,
  };
}

/**
 * What `make` gives for each person, agent and model of `rows`, «(sin dato)», an empty name, too,
 * from their changes: by kind, the most changes first, then by name, and «(sin dato)» last of its
 * kind.
 */
export function perWho<T extends { readonly who: StatsWho; readonly changes: number }>(
  rows: readonly StatsRow[],
  make: (who: StatsWho, own: readonly StatsRow[]) => T,
): T[] {
  return WHO_KINDS.flatMap((kind) => {
    const groups = new Map<string, StatsRow[]>();
    for (const row of rows) {
      const name = row[kind] ?? "";
      const group = groups.get(name);
      if (group === undefined) groups.set(name, [row]);
      else group.push(row);
    }
    return [...groups]
      .map(([name, own]) => make({ kind, name }, own))
      .toSorted(
        (one, other) =>
          Number(one.who.name === "") - Number(other.who.name === "") ||
          other.changes - one.changes ||
          one.who.name.localeCompare(other.who.name),
      );
  });
}
