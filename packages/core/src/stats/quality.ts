// SPDX-License-Identifier: Apache-2.0
// The panel's «Calidad» (docs/ui.md, «Panel»): what Specty checked on completing the tasks and on
// accepting, in a period: the task verifications that pass day by day, the full verifications
// that failed, the contract tests, what the tasks left and the changes that failed the most.
import { addDays, inRange, type StatsRange, sum } from "./period";
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
  const filesOf = (row: StatsRow, locked: boolean) =>
    new Set(
      within(row.contract)
        .filter((one) => one.locked === locked)
        .flatMap((one) => one.files),
    ).size;
  return {
    unit: rhythm.unit,
    buckets: bucketsOf(
      rows.flatMap((row) => within(row.verifications)),
      rhythm,
    ),
    full: { failed: full.filter((one) => !one.passed).length, total: full.length },
    tests: {
      proposed: sum(rows.map((row) => filesOf(row, false))),
      locked: sum(rows.map((row) => filesOf(row, true))),
    },
    risks: sum(findings.map((one) => one.risks)),
    longFiles: sum(findings.map((one) => one.longFiles)),
    removedAssertions: sum(findings.map((one) => one.removed)),
    worst: worstOf(rows, within),
  };
}

/** The verifications that passed, of how many, in each of the rhythm's days or weeks. */
function bucketsOf(
  verifications: readonly { readonly day: string; readonly passed: boolean }[],
  rhythm: StatsRhythm,
): StatsQuality["buckets"] {
  const buckets = rhythm.buckets.map(({ from, to }) => ({ from, to, passed: 0, total: 0 }));
  const byDay = new Map<string, (typeof buckets)[number]>();
  for (const bucket of buckets) {
    for (let day = bucket.from; day <= bucket.to; day = addDays(day, 1)) byDay.set(day, bucket);
  }
  for (const one of verifications) {
    const bucket = byDay.get(one.day);
    if (bucket === undefined) continue;
    bucket.total += 1;
    if (one.passed) bucket.passed += 1;
  }
  return buckets;
}

/** The changes with a task verification failed in the period: the most failed, then the most. */
function worstOf(
  rows: readonly StatsRow[],
  within: (facts: StatsRow["verifications"]) => StatsRow["verifications"],
): StatsQuality["worst"] {
  return rows
    .map((row) => {
      const own = within(row.verifications);
      return { id: row.id, failed: own.filter((one) => !one.passed).length, total: own.length };
    })
    .filter((one) => one.failed > 0)
    .toSorted(
      (one, other) =>
        other.failed - one.failed || other.total - one.total || one.id.localeCompare(other.id),
    )
    .slice(0, WORST);
}
