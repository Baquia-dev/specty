// SPDX-License-Identifier: Apache-2.0
// The panel's «Personas y agentes» (docs/ui.md, «Panel»): for each person, agent and model, what
// their changes did in the period, counted as the panel's figures count it.
import { addedUp, type OwnCounts, perWho } from "./counts";
import { inRange, type StatsRange, type StatsWho } from "./period";
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
  /**
   * The agent sessions, each once, that worked on them in it; none when no line of their changes
   * tells its session, on any day.
   */
  readonly sessions: number | null;
  /** The US dollars measured in it; none when nothing was. */
  readonly cost: number | null;
}

/**
 * A row per person, agent and model with a change of `rows` in `range`, «(sin dato)» (an empty
 * name) too: by kind, the most changes first, then by name, and «(sin dato)» last of its kind.
 * `own` has what each of `rows` did in `range` (`ownCounts`).
 */
export function statsPeople(
  rows: readonly StatsRow[],
  range: StatsRange,
  own: ReadonlyMap<StatsRow, OwnCounts>,
): readonly StatsPeopleRow[] {
  const lived = rows.filter((row) => row.lived.from <= range.to && row.lived.to >= range.from);
  return perWho(lived, (who, theirs) => rowOf(who, theirs, range, own));
}

/** What `rows`, the changes of `who`, did in `range`, from what each did, in `own`. */
function rowOf(
  who: StatsWho,
  rows: readonly StatsRow[],
  range: StatsRange,
  own: ReadonlyMap<StatsRow, OwnCounts>,
): StatsPeopleRow {
  const counts = addedUp(rows, own);
  const sessions = rows.flatMap((row) =>
    row.sessions.filter((one) => inRange(one.day, range)).map((one) => one.id),
  );
  return {
    who,
    changes: rows.length,
    tasks: counts.tasks,
    cycle: counts.cycle,
    verifications: counts.passing,
    sessions: rows.every((row) => row.sessions.length === 0) ? null : new Set(sessions).size,
    cost: counts.cost,
  };
}
