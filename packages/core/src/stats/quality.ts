// SPDX-License-Identifier: Apache-2.0
// The panel's «Calidad» (docs/ui.md, «Panel»): what Specty checked on completing the tasks and on
// accepting, in a period: the task verifications that pass day by day, the full verifications
// that failed, the contract tests, what the tasks left and the changes that failed the most.
import { inRange, rangeFinder, type StatsRange, sum } from "./period";
import type { StatsRhythm } from "./rhythm";
import type { StatsRow } from "./rows";

/** At most this many changes in the list of those that failed the most. */
const WORST = 5;

/** What Specty checked in a period. */
export interface StatsQuality {
  readonly unit: StatsRhythm["unit"];
  /** The task verifications of each day or week of the rhythm: how many passed of how many. */
  readonly buckets: readonly {
    readonly from: string;
    readonly to: string;
    readonly passed: number;
    readonly total: number;
  }[];
  /** The full verifications (`change.verified`): how many failed, a timeout too, of how many. */
  readonly full: { readonly failed: number; readonly total: number };
  /** The contract tests sent and those locked red, each file once per change. */
  readonly tests: { readonly proposed: number; readonly locked: number };
  /** What the tasks completed left: risk findings, long files and assertions removed. */
  readonly risks: number;
  readonly longFiles: number;
  readonly removedAssertions: number;
  /** The changes with most task verifications failed, the most first: how many of how many. */
  readonly worst: readonly {
    readonly id: string;
    /** The title of its row, when it brings one. */
    readonly title?: string;
    readonly failed: number;
    readonly total: number;
  }[];
}

/** The quality of `rows` in `range`, its task verifications by the days or weeks of `rhythm`. */
export function statsQuality(
  rows: readonly StatsRow[],
  range: StatsRange,
  rhythm: StatsRhythm,
): StatsQuality {
  const within = <Fact extends { readonly day: string }>(facts: readonly Fact[]) =>
    facts.filter((one) => inRange(one.day, range));
  const full = rows.flatMap((row) => within(row.full));
  const findings = rows.flatMap((row) => within(row.findings));
  const tested = rows.filter((row) => row.contract.length > 0);
  const filesOf = (row: StatsRow, locked: boolean) =>
    new Set(
      within(row.contract)
        .filter((one) => one.locked === locked)
        .flatMap((one) => one.files),
    ).size;
  const { buckets, worst } = verifiedOf(rows, rhythm);
  return {
    unit: rhythm.unit,
    buckets,
    full: { failed: full.filter((one) => !one.passed).length, total: full.length },
    tests: {
      proposed: sum(tested.map((row) => filesOf(row, false))),
      locked: sum(tested.map((row) => filesOf(row, true))),
    },
    risks: sum(findings.map((one) => one.risks)),
    longFiles: sum(findings.map((one) => one.longFiles)),
    removedAssertions: sum(findings.map((one) => one.removed)),
    worst,
  };
}

/**
 * The task verifications of `rows` in the rhythm's days or weeks, which cover its period: how
 * many passed of how many in each, and the changes with most failed, the most first, then the
 * most. It goes through them once.
 */
function verifiedOf(
  rows: readonly StatsRow[],
  rhythm: StatsRhythm,
): Pick<StatsQuality, "buckets" | "worst"> {
  const buckets = rhythm.buckets.map(({ from, to }) => ({ from, to, passed: 0, total: 0 }));
  const find = rangeFinder(buckets);
  const failing: StatsQuality["worst"][number][] = [];
  for (const row of rows) {
    let failed = 0;
    let total = 0;
    for (const one of row.verifications) {
      const bucket = buckets[find(one.day)];
      if (bucket === undefined) continue;
      bucket.total += 1;
      total += 1;
      if (one.passed) bucket.passed += 1;
      else failed += 1;
    }
    if (failed === 0) continue;
    failing.push({
      id: row.id,
      ...(row.title === undefined ? {} : { title: row.title }),
      failed,
      total,
    });
  }
  const worst = failing.toSorted(
    (one, other) =>
      other.failed - one.failed || other.total - one.total || one.id.localeCompare(other.id),
  );
  return { buckets, worst: worst.slice(0, WORST) };
}
