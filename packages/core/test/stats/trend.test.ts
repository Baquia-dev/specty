// SPDX-License-Identifier: Apache-2.0
// The panel's figures over the period (docs/ui.md, «Panel»): each of the six figures in each day,
// or week, of «Ritmo», for the minigraphs of the first row.
import { describe, expect, it } from "vitest";
import {
  type ChangeKind,
  type MemoryEntry,
  type StatsRow,
  statsQuery,
  statsRow,
  statsView,
} from "../../src";

/** The server's today, and a local time `days` before it, at `hour`:`minute`. */
const TODAY = "2026-11-07";
const at = (days: number, hour = 12, minute = 0) =>
  new Date(2026, 10, 7 - days, hour, minute).toISOString();

type Line = Readonly<Record<string, unknown>>;

/** An audit line of the agent at `ts`, with what `extra` adds or replaces. */
const line = (ts: string, event: string, extra: Line = {}): Line => ({
  ts,
  actor: "agent",
  event,
  data: {},
  ...extra,
});

/** The row of a change approved by Ana. */
function row(id: string, kind: ChangeKind, lines: readonly Line[]): StatsRow {
  const approved = {
    revision: 1,
    hash: `sha256:${"a".repeat(64)}`,
    at: at(60),
    by: "Ana",
    channel: "tty" as const,
  };
  const found = statsRow({ id, kind, approved }, lines);
  if (found === undefined) throw new Error(`no row for ${id}`);
  return found;
}

const created = (ts: string) => line(ts, "change.created", { tool: "claude-code" });
const closed = (ts: string) => line(ts, "change.closed", { actor: "human", by: "Ana" });
const verified = (ts: string, exit: number) =>
  line(ts, "task.verified", { actor: "specty", data: { task: "T1", exit } });
const usage = (ts: string, cost?: number) =>
  line(ts, "change.usage", {
    actor: "specty",
    data: { calls: 3, input: 1, output: 2, ...(cost === undefined ? {} : { cost }) },
  });

/** A memory entry created `days` before today; done or dropped ones say when. */
function entry(
  id: string,
  kind: MemoryEntry["kind"],
  status: MemoryEntry["status"],
  days: number,
  more: Partial<MemoryEntry> = {},
): MemoryEntry {
  return { id, kind, status, created: at(days), origin: { by: "claude-code" }, text: id, ...more };
}

const HOUR = 3_600_000;

/**
 * Closed on 4 November (1 h, half its verifications passing, 2.5 USD) and on 6 November (3 h and
 * 5 h, its verification passing, a usage with no cost); and one closed 40 days before (2 h, 1 USD).
 */
const ROWS = [
  row("20261104-uno", "standard", [
    created(at(3, 9)),
    line(at(3, 9, 30), "task.completed"),
    verified(at(3, 9, 30), 0),
    verified(at(3, 9, 40), 1),
    usage(at(3, 10), 2.5),
    closed(at(3, 10)),
  ]),
  row("20261106-dos", "quick", [
    created(at(1, 8)),
    line(at(1, 9), "task.completed"),
    line(at(1, 10), "task.completed"),
    verified(at(1, 10), 0),
    usage(at(1, 11)),
    closed(at(1, 11)),
  ]),
  row("20261106-tres", "quick", [created(at(1, 6)), closed(at(1, 11))]),
  row("20260928-antes", "standard", [
    created(at(40, 8)),
    line(at(40, 9), "task.completed"),
    verified(at(40, 9), 0),
    usage(at(40, 10), 1),
    closed(at(40, 10)),
  ]),
];

/**
 * P1 open since 28 October; P2 open since 5 November; P3 open from 2 November until it was done
 * on 6 November; a decision, which never waits.
 */
const MEMORY = [
  entry("P1", "pending", "open", 10),
  entry("P2", "reminder", "open", 2),
  entry("P3", "improvement", "done", 5, { closed: { at: at(1), by: "Ana" } }),
  entry("D1", "decision", "open", 4, { quote: "Así" }),
];

/** A day of the period with nothing but the pending items open at its end. */
const quiet = (day: string, pending: number) => ({
  from: day,
  to: day,
  closed: 0,
  tasks: 0,
  cycle: null,
  verifications: null,
  cost: null,
  pending,
});

describe("the panel's figures over the period", () => {
  it("AC5: gives the six figures in each day of the period, with nothing where a day has no data for them", () => {
    const { trend } = statsView({
      rows: ROWS,
      memory: MEMORY,
      today: TODAY,
      query: statsQuery({ period: "7d" }),
    });
    expect(trend?.unit).toBe("day");
    expect(trend?.buckets).toEqual([
      quiet("2026-11-01", 1),
      quiet("2026-11-02", 2),
      quiet("2026-11-03", 2),
      {
        from: "2026-11-04",
        to: "2026-11-04",
        closed: 1,
        tasks: 1,
        cycle: HOUR,
        verifications: 0.5,
        cost: 2.5,
        pending: 2,
      },
      quiet("2026-11-05", 3),
      {
        from: "2026-11-06",
        to: "2026-11-06",
        closed: 2,
        tasks: 2,
        // The median of 3 h and 5 h; its usage has no cost, so nothing is measured.
        cycle: 4 * HOUR,
        verifications: 1,
        cost: null,
        pending: 2,
      },
      quiet("2026-11-07", 2),
    ]);
  });

  it("AC5: goes week by week from Monday above 45 days, the last week cut to today", () => {
    const { trend, rhythm } = statsView({
      rows: ROWS,
      memory: MEMORY,
      today: TODAY,
      query: statsQuery({ period: "90d" }),
    });
    expect(trend?.unit).toBe("week");
    // The same days or weeks as «Ritmo».
    expect(trend?.buckets.map(({ from, to }) => ({ from, to }))).toEqual(
      rhythm?.buckets.map(({ from, to }) => ({ from, to })),
    );
    expect(trend?.buckets).toHaveLength(13);
    expect(trend?.buckets[0]).toEqual({
      from: "2026-08-10",
      to: "2026-08-16",
      closed: 0,
      tasks: 0,
      cycle: null,
      verifications: null,
      cost: null,
      pending: 0,
    });
    expect(trend?.buckets[7]).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
      closed: 1,
      tasks: 1,
      cycle: 2 * HOUR,
      verifications: 1,
      cost: 1,
      pending: 0,
    });
    const last = trend?.buckets.at(-1);
    expect(last).toMatchObject({
      from: "2026-11-02",
      to: "2026-11-07",
      closed: 3,
      tasks: 3,
      cycle: 3 * HOUR,
      cost: 2.5,
      // Open at the end of the week: P1 and P2.
      pending: 2,
    });
    expect(last?.verifications).toBeCloseTo(2 / 3);
  });

  it("AC5: counts only the changes of the cut, and the memory noted in them", () => {
    const memory = [
      ...MEMORY,
      entry("P4", "pending", "open", 1, { origin: { by: "claude-code", change: "20261106-dos" } }),
    ];
    const { trend } = statsView({
      rows: ROWS,
      memory,
      today: TODAY,
      query: statsQuery({ period: "7d", kind: "quick" }),
    });
    expect(trend?.buckets.map((bucket) => bucket.closed)).toEqual([0, 0, 0, 0, 0, 2, 0]);
    expect(trend?.buckets.map((bucket) => bucket.tasks)).toEqual([0, 0, 0, 0, 0, 2, 0]);
    expect(trend?.buckets.map((bucket) => bucket.pending)).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });
});
