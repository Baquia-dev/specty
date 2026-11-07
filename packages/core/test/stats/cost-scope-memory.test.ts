// SPDX-License-Identifier: Apache-2.0
// The panel's «Coste y tokens», «Alcance e integraciones» and «Memoria» (docs/ui.md, «Panel»):
// what the changes of a period cost and in what, how far their work went out of its plan and
// what merging main took, and what was noted in the memory, each fact by the day of its event.
import { describe, expect, it } from "vitest";
import {
  type ChangeKind,
  type MemoryEntry,
  type StatsRow,
  type StatsView,
  statsQuery,
  statsRow,
  statsView,
} from "../../src";

/** The server's today, and a local time `days` before it, at `hour`. */
const TODAY = "2026-11-07";
const at = (days: number, hour = 12) => new Date(2026, 10, 7 - days, hour).toISOString();

type Line = Readonly<Record<string, unknown>>;

/** An audit line of the agent at `ts`, with what `extra` adds or replaces. */
const line = (ts: string, event: string, extra: Line = {}): Line => ({
  ts,
  actor: "agent",
  event,
  data: {},
  ...extra,
});

/** The row of a change of `kind` from its audit. */
function row(id: string, lines: readonly Line[], kind: ChangeKind = "standard"): StatsRow {
  const found = statsRow({ id, kind }, lines);
  if (found === undefined) throw new Error(`no row for ${id}`);
  return found;
}

const created = (ts: string, by?: string) =>
  line(ts, "change.created", { tool: "claude-code", ...(by === undefined ? {} : { by }) });
const completed = (ts: string, session?: string) =>
  line(ts, "task.completed", {
    data: { task: "T1" },
    ...(session === undefined ? {} : { session }),
  });
const closed = (ts: string) => line(ts, "change.closed", { actor: "human", by: "Ana" });
/** A `change.usage` at `ts` with `data`: its calls, tokens and, maybe, its cost. */
const usage = (ts: string, data: Line) => line(ts, "change.usage", { actor: "specty", data });
const decided = (ts: string, decision: string) =>
  line(ts, "scope.decided", { actor: "human", data: { id: "S1", decision } });
const stopped = (ts: string, reason: string) =>
  line(ts, "integration.started", {
    actor: "specty",
    data: { target: "main", commit: "abc", reason, conflicts: [] },
  });
const adjusted = (ts: string) => line(ts, "adjust.requested", { data: { request: "otro" } });

/** A memory entry created `days` before today, noted in `change` if one is given. */
function entry(
  id: string,
  kind: MemoryEntry["kind"],
  status: MemoryEntry["status"],
  days: number,
  change?: string,
): MemoryEntry {
  return {
    id,
    kind,
    status,
    created: at(days),
    origin: { by: "claude-code", ...(change === undefined ? {} : { change }) },
    text: id,
  };
}

/** The panel of `rows` and `memory` for the cut that `params` ask for, as of today. */
const panel = (
  rows: readonly StatsRow[],
  params: Parameters<typeof statsQuery>[0] = {},
  memory: readonly MemoryEntry[] = [],
) => statsView({ rows, memory, today: TODAY, query: statsQuery(params) });

function costOf(view: StatsView): NonNullable<StatsView["cost"]> {
  if (view.cost === undefined) throw new Error("no cost");
  return view.cost;
}

function scopeOf(view: StatsView): NonNullable<StatsView["scope"]> {
  if (view.scope === undefined) throw new Error("no scope");
  return view.scope;
}

function memoryOf(view: StatsView): NonNullable<StatsView["memory"]> {
  if (view.memory === undefined) throw new Error("no memory");
  return view.memory;
}

/** The milliseconds from `from` to `to`, whatever the clock changes between them. */
const span = (from: string, to: string) => Date.parse(to) - Date.parse(from);

/** Five changes with usage in the last 30 days, one before them, and how each one went. */
function spending(): StatsRow[] {
  return [
    // 1.5 USD on 28 Oct, two tasks in two sessions.
    row("a", [
      created(at(20)),
      completed(at(11), "s1"),
      completed(at(10), "s2"),
      usage(at(10, 13), {
        calls: 10,
        input: 100,
        output: 200,
        cacheWrite: 300,
        cacheRead: 4000,
        cost: 1.5,
      }),
      closed(at(10, 13)),
    ]),
    // 0.25 USD on 5 Nov, a quick one.
    row(
      "b",
      [
        created(at(3)),
        completed(at(2), "s3"),
        usage(at(2, 13), {
          calls: 2,
          input: 1,
          output: 2,
          cacheWrite: 3,
          cacheRead: 4,
          cost: 0.25,
        }),
        closed(at(2, 13)),
      ],
      "quick",
    ),
    // Tokens without a cost: they count, the cost does not.
    row("c", [
      created(at(4)),
      usage(at(2, 14), { calls: 5, input: 10, output: 20, cacheWrite: 30, cacheRead: 40 }),
      closed(at(2, 14)),
    ]),
    // Still open, with a cost on 6 Nov and only some of the tokens said.
    row("e", [created(at(1, 9)), usage(at(1, 10), { calls: 1, output: 5, cost: 0.5 })]),
    // Measured in the 30 days before: none of it counts.
    row("d", [
      created(at(45)),
      usage(at(40), { calls: 9, input: 9, output: 9, cacheWrite: 9, cacheRead: 9, cost: 9 }),
      closed(at(40)),
    ]),
  ];
}

describe("the panel's cost and tokens", () => {
  it("AC6: the cost of each day, the tokens of every usage of the period, the cost of each lane and the costliest changes", () => {
    const cost = costOf(panel(spending()));
    expect(cost.unit).toBe("day");
    expect(cost.buckets).toHaveLength(30);
    expect(cost.buckets[0]).toEqual({ from: "2026-10-09", to: "2026-10-09", cost: 0 });
    expect(cost.buckets.filter((bucket) => bucket.cost > 0)).toEqual([
      { from: "2026-10-28", to: "2026-10-28", cost: 1.5 },
      { from: "2026-11-05", to: "2026-11-05", cost: 0.25 },
      { from: "2026-11-06", to: "2026-11-06", cost: 0.5 },
    ]);
    // Every usage of the period, with a cost or without; what one does not say counts 0.
    expect(cost.tokens).toEqual({
      input: 111,
      output: 227,
      cacheWrite: 333,
      cacheRead: 4044,
      calls: 18,
      changes: 4,
    });
    // Only the lanes with a cost, the most first, and on how many changes it was measured.
    expect(cost.lanes).toEqual([
      { kind: "standard", cost: 2, changes: 2 },
      { kind: "quick", cost: 0.25, changes: 1 },
    ]);
    // The cost of the period; the tasks, the cycle and the sessions of the whole change.
    expect(cost.top).toEqual([
      {
        id: "a",
        kind: "standard",
        cost: 1.5,
        tasks: 2,
        cycle: span(at(20), at(10, 13)),
        sessions: 2,
      },
      { id: "e", kind: "standard", cost: 0.5, tasks: 0, cycle: null, sessions: 0 },
      { id: "b", kind: "quick", cost: 0.25, tasks: 1, cycle: span(at(3), at(2, 13)), sessions: 1 },
    ]);
  });

  it("AC6: the costliest are five at most, the most first and, on a tie, by id", () => {
    const rows = [3, 1, 4, 1, 5, 9, 2].map((cost, index) =>
      row(`c${index}`, [created(at(5)), usage(at(4), { calls: 1, cost }), closed(at(4))]),
    );
    expect(costOf(panel(rows)).top.map((change) => [change.id, change.cost])).toEqual([
      ["c5", 9],
      ["c4", 5],
      ["c2", 4],
      ["c0", 3],
      ["c6", 2],
    ]);
  });

  it("AC6: counts only the changes of the cut, and goes week by week in a longer period", () => {
    const quick = costOf(panel(spending(), { kind: "quick" }));
    expect(quick.lanes).toEqual([{ kind: "quick", cost: 0.25, changes: 1 }]);
    expect(quick.top.map((change) => change.id)).toEqual(["b"]);
    expect(quick.tokens).toEqual({
      input: 1,
      output: 2,
      cacheWrite: 3,
      cacheRead: 4,
      calls: 2,
      changes: 1,
    });

    const quarter = costOf(panel(spending(), { period: "90d" }));
    expect(quarter.unit).toBe("week");
    expect(quarter.buckets).toHaveLength(13);
    // The week of 28 Oct (from Monday 27 Oct), and the last one, cut to today.
    expect(quarter.buckets.filter((bucket) => bucket.cost > 0)).toEqual([
      { from: "2026-09-28", to: "2026-10-04", cost: 9 },
      { from: "2026-10-26", to: "2026-11-01", cost: 1.5 },
      { from: "2026-11-02", to: "2026-11-07", cost: 0.75 },
    ]);
    expect(quarter.tokens.changes).toBe(5);

    const none = costOf(panel([row("x", [created(at(3)), closed(at(2))])]));
    expect(none.tokens).toEqual({
      input: 0,
      output: 0,
      cacheWrite: 0,
      cacheRead: 0,
      calls: 0,
      changes: 0,
    });
    expect(none.lanes).toEqual([]);
    expect(none.top).toEqual([]);
  });
});

/** Two changes with scope decisions, merges of main that stopped and adjustments; one before. */
function planned(): StatsRow[] {
  return [
    row("a", [
      created(at(6), "Ana"),
      decided(at(3), "auto"),
      decided(at(3), "approved"),
      decided(at(2), "rejected"),
      // A decision it does not know, and a request not yet decided, do not count.
      decided(at(2), "maybe"),
      line(at(3), "scope.requested", { data: { id: "S2", paths: ["x.ts"] } }),
      stopped(at(3), "verify"),
      stopped(at(2), "conflicts"),
      adjusted(at(2)),
      adjusted(at(1)),
    ]),
    row("b", [
      created(at(5), "Bea"),
      decided(at(1), "approved"),
      stopped(at(1), "conflicts"),
      stopped(at(1), "other"),
    ]),
    row("c", [
      created(at(45), "Ana"),
      decided(at(40), "auto"),
      stopped(at(40), "verify"),
      adjusted(at(40)),
    ]),
  ];
}

describe("the panel's scope and integrations", () => {
  it("AC6: the scope requests decided in the period by decision, the merges of main that stopped and the adjustments, with on how many changes", () => {
    const scope = scopeOf(panel(planned()));
    expect(scope).toEqual({
      requests: { auto: 1, approved: 2, rejected: 1 },
      integrations: { verify: 1, conflicts: 2, changes: 2 },
      adjustments: { requested: 2, changes: 1 },
    });
  });

  it("AC6: counts only the changes of the cut", () => {
    expect(scopeOf(panel(planned(), { who: "person:Bea" }))).toEqual({
      requests: { auto: 0, approved: 1, rejected: 0 },
      integrations: { verify: 0, conflicts: 1, changes: 1 },
      adjustments: { requested: 0, changes: 0 },
    });
    expect(scopeOf(panel(planned(), { period: "90d" }))).toEqual({
      requests: { auto: 2, approved: 2, rejected: 1 },
      integrations: { verify: 2, conflicts: 2, changes: 3 },
      adjustments: { requested: 3, changes: 2 },
    });
  });
});

describe("the panel's memory", () => {
  const memory = [
    entry("P1", "pending", "open", 3, "a"),
    entry("P2", "improvement", "done", 2, "b"),
    entry("P3", "reminder", "open", 1),
    entry("D1", "decision", "open", 5, "a"),
    entry("P4", "lesson", "open", 40, "a"),
    entry("P5", "pending", "dropped", 1, "b"),
    entry("P6", "pending", "drop-proposed", 2, "a"),
  ];
  const rows = [row("a", [created(at(6), "Ana")]), row("b", [created(at(5), "Bea")])];

  it("AC6: the entries noted in the period, by their status and their kind", () => {
    expect(memoryOf(panel(rows, {}, memory))).toEqual({
      entries: 6,
      statuses: { open: 3, taken: 0, done: 1, "drop-proposed": 1, dropped: 1 },
      kinds: { pending: 3, improvement: 1, reminder: 1, decision: 1, lesson: 0 },
    });
  });

  it("AC6: with a filter, only the entries noted in a change of the cut", () => {
    expect(memoryOf(panel(rows, { who: "person:Ana" }, memory))).toEqual({
      entries: 3,
      statuses: { open: 2, taken: 0, done: 0, "drop-proposed": 1, dropped: 0 },
      kinds: { pending: 2, improvement: 0, reminder: 0, decision: 1, lesson: 0 },
    });
    expect(memoryOf(panel(rows, { period: "90d" }, memory)).entries).toBe(7);
  });
});
