// SPDX-License-Identifier: Apache-2.0
// The panel's «Ritmo» (docs/ui.md, «Panel»): the changes closed, by lane, and the tasks
// completed, day by day or, in a longer period, week by week from Monday.
import type { ChangeKind } from "../spec/model";
import { addDays, rangeFinder, type StatsRange } from "./period";
import type { StatsRow } from "./rows";

/** Up to this many days the rhythm goes day by day; above them, week by week. */
const MAX_DAYS = 45;
const DAY_MS = 86_400_000;

/** The rhythm of a period: its days, or its weeks, each with what happened in it. */
export interface StatsRhythm {
  readonly unit: "day" | "week";
  /** Each day or week of the period, both ends included. */
  readonly buckets: readonly {
    readonly from: string;
    readonly to: string;
    /** The changes closed in it, by lane. */
    readonly closed: Readonly<Record<ChangeKind, number>>;
    /** The tasks completed in it. */
    readonly tasks: number;
  }[];
}

/**
 * The rhythm of `rows` in `range`: each change closed on the day it closed, by lane, and each
 * task on the day it was completed. Days or weeks with nothing count 0.
 */
export function statsRhythm(rows: readonly StatsRow[], range: StatsRange): StatsRhythm {
  const { unit, spans } = calendarOf(range);
  const buckets = spans.map((span) => ({ ...span, closed: noneClosed(), tasks: 0 }));
  const find = rangeFinder(buckets);
  const bucketOf = (day: string) => buckets[find(day)];
  for (const row of rows) {
    const closing = row.closedDay === undefined ? undefined : bucketOf(row.closedDay);
    if (closing !== undefined) closing.closed[row.kind] += 1;
    for (const day of row.tasks) {
      const bucket = bucketOf(day);
      if (bucket !== undefined) bucket.tasks += 1;
    }
  }
  return { unit, buckets };
}

/** The days of `range`, or its weeks from Monday to Sunday, the first and the last cut to it. */
function calendarOf(range: StatsRange) {
  const first = dayNumber(range.from);
  const length = dayNumber(range.to) - first + 1;
  const unit = length > MAX_DAYS ? "week" : "day";
  const size = unit === "week" ? 7 : 1;
  // The days of the first week before the period: 1 January 1970 was a Thursday, Monday is 0.
  const before = unit === "week" ? (first + 3) % 7 : 0;
  const count = Math.ceil((length + before) / size);
  const spans = Array.from({ length: count }, (_, index) => ({
    from: addDays(range.from, Math.max(0, index * size - before)),
    to: addDays(range.from, Math.min(length, (index + 1) * size - before) - 1),
  }));
  return { unit, spans } as const;
}

/** The days from 1 January 1970 to `day`, a YYYY-MM-DD of the calendar. */
function dayNumber(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / DAY_MS;
}

function noneClosed(): Record<ChangeKind, number> {
  return { quick: 0, standard: 0, spike: 0, retro: 0, epic: 0 };
}
