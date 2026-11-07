// SPDX-License-Identifier: Apache-2.0
// How the panel (docs/ui.md, «Panel») counts what some changes did in a period, and how it lists
// people, agents and models: the first row's figures and «Personas y agentes» count the cycle, the
// verifications and the cost with it, and order by changes with it, so their figures agree.
import { dayOf, inRange, median, type StatsRange, type StatsWho, sum, WHO_KINDS } from "./period";
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
