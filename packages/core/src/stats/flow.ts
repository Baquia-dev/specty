// SPDX-License-Identifier: Apache-2.0
// The panel's «Flujo y esperas» (docs/ui.md, «Panel»): where the time of a change goes, phase by
// phase, who approves the specs, how long the person waits and how many agent sessions a change
// takes, each fact by the day of its event.
import { inRange, median, type StatsRange, sum } from "./period";
import type { StatsRow } from "./rows";

/** The phases of a change, in order: write the spec, review it, implement it, accept and close. */
const PHASES = ["spec", "review", "implementation", "closing"] as const;

type Channel = StatsRow["approvals"][number]["channel"];

/** Where the time of the changes of a period went, and who decided. */
export interface StatsFlow {
  /**
   * Each phase, in order: the median milliseconds of the changes closed in the period that went
   * through it, none without any, and how many did.
   */
  readonly phases: readonly {
    readonly phase: (typeof PHASES)[number];
    readonly median: number | null;
    readonly changes: number;
  }[];
  /** The spec approvals of the period, by who gave them. */
  readonly approvals: Readonly<Record<Channel, number>>;
  /** The review of the person's approvals (terminal or UI): its median and how many. */
  readonly wait: { readonly median: number | null; readonly approvals: number };
  /** The proposals each approval of the period took, on average; none without any. */
  readonly revisions: number | null;
  /**
   * The distinct agent sessions per change, on average, among the changes that tell one in the
   * period, and how many do.
   */
  readonly sessions: { readonly mean: number | null; readonly changes: number };
}

/** The flow of `rows` in `range`. */
export function statsFlow(rows: readonly StatsRow[], range: StatsRange): StatsFlow {
  const timed = rows.flatMap((row) =>
    row.closed !== undefined && row.closedDay !== undefined && inRange(row.closedDay, range)
      ? [phasesOf(row, row.closed)]
      : [],
  );
  const approvals = rows.flatMap((row) => row.approvals.filter((one) => inRange(one.day, range)));
  const waits = approvals.flatMap((one) =>
    one.channel !== "delegated" && one.review !== null ? [one.review] : [],
  );
  const sessions = rows.flatMap((row) => {
    if (row.sessions.length === 0) return [];
    const own = new Set(row.sessions.filter((one) => inRange(one.day, range)).map((one) => one.id));
    return own.size === 0 ? [] : [own.size];
  });
  const count = (channel: Channel) => approvals.filter((one) => one.channel === channel).length;
  return {
    phases: PHASES.map((phase, index) => {
      const measured = timed.flatMap((one) => one[index] ?? []);
      return { phase, median: median(measured), changes: measured.length };
    }),
    approvals: { delegated: count("delegated"), tty: count("tty"), ui: count("ui") },
    wait: { median: median(waits), approvals: waits.length },
    revisions: mean(approvals.map((one) => one.proposals)),
    sessions: { mean: mean(sessions), changes: sessions.length },
  };
}

/**
 * The milliseconds of each phase of a closed change. A phase it did not go through (no proposal,
 * no task) is none and its time goes to the next; one that would end before it starts, as the
 * tasks of a change approved again after them, is 0.
 */
function phasesOf(row: StatsRow, closed: string): readonly (number | null)[] {
  const ends = [row.proposed, row.approvals.at(-1)?.at, row.completed, closed];
  let from = Date.parse(row.created);
  return ends.map((end) => {
    if (end === undefined) return null;
    const to = Date.parse(end);
    const took = Math.max(0, to - from);
    from = Math.max(from, to);
    return took;
  });
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}
