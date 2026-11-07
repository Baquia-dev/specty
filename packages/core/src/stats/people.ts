// SPDX-License-Identifier: Apache-2.0
// The panel's «Personas y agentes» (docs/ui.md, «Panel»): for each person, agent and model, what
// their changes did in the period, counted as the panel's figures count it.
import {
  dayOf,
  inRange,
  median,
  type StatsRange,
  type StatsWho,
  type StatsWhoKind,
  sum,
} from "./period";
import type { StatsRow } from "./rows";

/** A person, an agent or a model, and what their changes did in the period. */
export interface StatsPeopleRow {
  readonly who: StatsWho;
  /** Their changes whose life touches the period. */
  readonly changes: number;
  /** The tasks they completed in it. */
  readonly tasks: number;
  /** The median milliseconds from created to closed of theirs closed in it; none without any. */
  readonly cycle: number | null;
  /** The share of their task verifications in it that passed, from 0 to 1; none without any. */
  readonly verifications: number | null;
  /** The agent sessions, each once, that worked on them in it. */
  readonly sessions: number;
  /** The US dollars measured in it; none when nothing was. */
  readonly cost: number | null;
}

const WHO_KINDS: readonly StatsWhoKind[] = ["person", "agent", "model"];

/**
 * A row per person, agent and model with a change of `rows` in `range`, «(sin dato)» (an empty
 * name) too: by kind, the most changes first, then by name, and «(sin dato)» last of its kind.
 */
export function statsPeople(
  rows: readonly StatsRow[],
  range: StatsRange,
): readonly StatsPeopleRow[] {
  const lived = rows.filter((row) => row.lived.from <= range.to && row.lived.to >= range.from);
  return WHO_KINDS.flatMap((kind) => {
    const groups = new Map<string, StatsRow[]>();
    for (const row of lived) {
      const name = row[kind] ?? "";
      const group = groups.get(name);
      if (group === undefined) groups.set(name, [row]);
      else group.push(row);
    }
    return [...groups]
      .map(([name, own]) => rowOf({ kind, name }, own, range))
      .toSorted(
        (one, other) =>
          Number(one.who.name === "") - Number(other.who.name === "") ||
          other.changes - one.changes ||
          one.who.name.localeCompare(other.who.name),
      );
  });
}

/** What `rows`, the changes of `who`, did in `range`. */
function rowOf(who: StatsWho, rows: readonly StatsRow[], range: StatsRange): StatsPeopleRow {
  const cycles = rows.flatMap((row) =>
    row.closed !== undefined && inRange(dayOf(row.closed), range)
      ? [Date.parse(row.closed) - Date.parse(row.created)]
      : [],
  );
  const verified = rows.flatMap((row) =>
    row.verifications.filter((one) => inRange(one.day, range)),
  );
  const costs = rows.flatMap((row) => row.costs.filter((one) => inRange(one.day, range)));
  const sessions = rows.flatMap((row) =>
    row.sessions.filter((one) => inRange(one.day, range)).map((one) => one.id),
  );
  return {
    who,
    changes: rows.length,
    tasks: sum(rows.map((row) => row.tasks.filter((day) => inRange(day, range)).length)),
    cycle: median(cycles),
    verifications:
      verified.length === 0 ? null : verified.filter((one) => one.passed).length / verified.length,
    sessions: new Set(sessions).size,
    cost: costs.length === 0 ? null : sum(costs.map((one) => one.cost)),
  };
}
