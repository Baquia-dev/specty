// SPDX-License-Identifier: Apache-2.0
// The panel's «Flujo y esperas» and «Calidad» (docs/ui.md, «Panel»): where a change's time goes,
// who approves the specs and how long the person waits, and what Specty checked on completing the
// tasks and on accepting, each fact by the day of its event.
import { describe, expect, it } from "vitest";
import {
  type ChangeKind,
  type StatsRow,
  type StatsView,
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

/** The row of a change of `kind` from its audit. */
function row(id: string, lines: readonly Line[], kind: ChangeKind = "standard"): StatsRow {
  const found = statsRow({ id, kind }, lines);
  if (found === undefined) throw new Error(`no row for ${id}`);
  return found;
}

const created = (ts: string) => line(ts, "change.created", { tool: "claude-code" });
const proposed = (ts: string) => line(ts, "spec.proposed", { data: { revision: 1 } });
const completed = (ts: string, data: Line = {}) =>
  line(ts, "task.completed", { data: { task: "T1", ...data } });
const closed = (ts: string) => line(ts, "change.closed", { actor: "human", by: "Ana" });
/** A spec approval by `channel`: the agent's when delegated, the person's otherwise. */
const approved = (ts: string, channel: string) =>
  channel === "delegated"
    ? line(ts, "spec.approved", { by: "Ana", data: { revision: 1, channel, delegated: true } })
    : line(ts, "spec.approved", { actor: "human", by: "Ana", data: { revision: 1, channel } });
const verified = (ts: string, exit: number) =>
  line(ts, "task.verified", { actor: "specty", data: { task: "T1", exit } });
const full = (ts: string, exit: number | null) =>
  line(ts, "change.verified", { actor: "specty", data: { cmd: "pnpm check", exit } });

/** The panel of `rows` for the cut that `params` ask for, as of today. */
const panel = (rows: readonly StatsRow[], params: Parameters<typeof statsQuery>[0] = {}) =>
  statsView({ rows, memory: [], today: TODAY, query: statsQuery(params) });

function flowOf(view: StatsView): NonNullable<StatsView["flow"]> {
  if (view.flow === undefined) throw new Error("no flow");
  return view.flow;
}

function qualityOf(view: StatsView): NonNullable<StatsView["quality"]> {
  if (view.quality === undefined) throw new Error("no quality");
  return view.quality;
}

const HOUR = 3_600_000;

describe("the panel's flow", () => {
  it("AC7: each phase's median over the changes closed in the period that went through it, and on how many", () => {
    const rows = [
      // 1 h to propose, 2 h of review, 4 h of tasks, 1 h to accept and close.
      row("a", [
        created(at(10, 8)),
        proposed(at(10, 9)),
        approved(at(10, 11), "delegated"),
        completed(at(10, 15)),
        closed(at(10, 16)),
      ]),
      // 2 h, then 4 h from its first proposal to its approval, 6 h and 12 h.
      row("b", [
        created(at(5, 8)),
        proposed(at(5, 10)),
        proposed(at(5, 11)),
        approved(at(5, 14), "tty"),
        completed(at(5, 20)),
        closed(at(4, 8)),
      ]),
      // No tasks: no implementation, and its acceptance runs from its approval.
      row(
        "c",
        [
          created(at(3, 8)),
          proposed(at(3, 8, 30)),
          approved(at(3, 9), "delegated"),
          closed(at(3, 10)),
        ],
        "epic",
      ),
      // Closed before the period, and still open: neither counts.
      row("old", [
        created(at(41, 8)),
        proposed(at(41, 9)),
        approved(at(41, 10), "tty"),
        completed(at(41, 11)),
        closed(at(40)),
      ]),
      row("open", [created(at(2, 8)), proposed(at(2, 20)), approved(at(2, 21), "tty")]),
    ];
    expect(flowOf(panel(rows)).phases).toEqual([
      { phase: "spec", median: HOUR, changes: 3 },
      { phase: "review", median: 2 * HOUR, changes: 3 },
      { phase: "implementation", median: 5 * HOUR, changes: 2 },
      { phase: "closing", median: HOUR, changes: 3 },
    ]);
  });

  it("AC7: a phase a change skipped goes to the next one, and one that would end before it starts counts 0", () => {
    const rows = [
      // Adjusted after its tasks: approved again later, with no new task.
      row("adjusted", [
        created(at(2, 8)),
        proposed(at(2, 9)),
        approved(at(2, 10), "delegated"),
        completed(at(2, 11)),
        proposed(at(2, 12)),
        approved(at(2, 13), "delegated"),
        closed(at(2, 15)),
      ]),
      // A manual change, never proposed: its review runs from its creation.
      row(
        "manual",
        [
          created(at(1, 8)),
          approved(at(1, 9), "tty"),
          completed(at(1, 10)),
          line(at(1, 11), "retro.confirmed", { actor: "human", data: { mode: "agent" } }),
        ],
        "retro",
      ),
    ];
    expect(flowOf(panel(rows)).phases).toEqual([
      { phase: "spec", median: HOUR, changes: 1 },
      { phase: "review", median: 2.5 * HOUR, changes: 2 },
      { phase: "implementation", median: 0.5 * HOUR, changes: 2 },
      { phase: "closing", median: 1.5 * HOUR, changes: 2 },
    ]);
  });

  it("AC7: each approval of the period by its channel, the person's wait and the proposals each one took", () => {
    const rows = [
      // Two proposals, approved in the terminal 4 h after the first.
      row("f", [
        created(at(6, 8)),
        proposed(at(6, 9)),
        proposed(at(6, 10)),
        approved(at(6, 13), "tty"),
      ]),
      // Approved by the agent, then adjusted and approved again in the UI, 2 h after proposing.
      row("g", [
        created(at(4, 8)),
        proposed(at(4, 9)),
        approved(at(4, 9, 10), "delegated"),
        proposed(at(2, 9)),
        approved(at(2, 11), "ui"),
      ]),
      // A pull request is the person outside the terminal: it counts with the UI.
      row("h", [created(at(1, 8)), proposed(at(1, 9)), approved(at(1, 12), "pr")]),
      // Approved before the period.
      row("old", [created(at(41, 8)), proposed(at(41, 9)), approved(at(40), "tty")]),
    ];
    const flow = flowOf(panel(rows));
    expect(flow.approvals).toEqual({ delegated: 1, tty: 1, ui: 2 });
    // The person's: 4 h, 2 h and 3 h.
    expect(flow.wait).toEqual({ median: 3 * HOUR, approvals: 3 });
    // 2, 1, 1 and 1 proposals.
    expect(flow.revisions).toBe(1.25);
  });

  it("AC7: with no approval in the period, nothing measures the wait nor the revisions", () => {
    const flow = flowOf(panel([row("a", [created(at(3, 8)), proposed(at(3, 9))])]));
    expect(flow.approvals).toEqual({ delegated: 0, tty: 0, ui: 0 });
    expect(flow.wait).toEqual({ median: null, approvals: 0 });
    expect(flow.revisions).toBeNull();
  });

  it("AC7: the sessions per change, among the changes that tell theirs in the period", () => {
    const session = (ts: string, id: string) => line(ts, "change.noted", { session: id });
    const silent = row("silent", [created(at(2, 8)), proposed(at(2, 9))]);
    const rows = [
      row("two", [created(at(3, 8)), session(at(3, 9), "s1"), session(at(2, 9), "s2")]),
      row("one", [
        created(at(41, 8)),
        // Before the period: it does not count.
        session(at(40), "s4"),
        session(at(2, 9), "s3"),
        session(at(1, 9), "s3"),
      ]),
      silent,
    ];
    expect(flowOf(panel(rows)).sessions).toEqual({ mean: 1.5, changes: 2 });
    expect(flowOf(panel([silent])).sessions).toEqual({ mean: null, changes: 0 });
  });
});

describe("the panel's quality", () => {
  it("AC7: the task verifications that pass, by the rhythm's days, and the full ones that failed", () => {
    const rows = [
      row("a", [
        created(at(21, 8)),
        // Before the period.
        verified(at(20), 1),
        full(at(20), 1),
        verified(at(3, 9), 0),
        verified(at(3, 10), 0),
        verified(at(1, 9), 0),
        verified(at(1, 10), 0),
        verified(at(1, 11), 1),
        verified(at(1, 12), 0),
        full(at(1, 13), 0),
        full(at(1, 14), 1),
        full(at(1, 15), null),
      ]),
    ];
    const view = panel(rows, { period: "7d" });
    const quality = qualityOf(view);
    expect(quality.unit).toBe("day");
    expect(quality.buckets.map(({ from, to }) => ({ from, to }))).toEqual(
      view.rhythm?.buckets.map(({ from, to }) => ({ from, to })),
    );
    expect(quality.buckets.map(({ passed, total }) => [passed, total])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [2, 2],
      [0, 0],
      [3, 4],
      [0, 0],
    ]);
    // A timeout (no exit) fails too.
    expect(quality.full).toEqual({ failed: 2, total: 3 });
  });

  it("AC7: by week in a longer period, with the rhythm's weeks", () => {
    const view = panel([row("a", [created(at(30)), verified(at(30), 1), verified(at(2), 0)])], {
      period: "90d",
    });
    const quality = qualityOf(view);
    expect(quality.unit).toBe("week");
    expect(quality.buckets.map(({ from, to }) => ({ from, to }))).toEqual(
      view.rhythm?.buckets.map(({ from, to }) => ({ from, to })),
    );
    expect(quality.buckets.reduce((all, bucket) => all + bucket.total, 0)).toBe(2);
  });

  it("AC7: the contract tests sent and locked, each file once per change, and what the tasks left", () => {
    const sent = (ts: string, files: readonly string[]) =>
      line(ts, "tests.proposed", { data: { count: files.length, files, red: [] } });
    const locked = (ts: string, files: readonly string[]) =>
      line(ts, "tests.locked", { actor: "specty", data: { count: files.length, files } });
    const rows = [
      row("feature", [
        created(at(41, 8)),
        // Before the period.
        completed(at(40), { risks: [{ path: "src/old.ts", rule: "shell" }] }),
        sent(at(4, 9), ["a.test.ts", "b.test.ts"]),
        // Sent again, with one more: three files.
        sent(at(3, 9), ["a.test.ts", "b.test.ts", "c.test.ts"]),
        completed(at(3, 12), {
          risks: [
            { path: "src/run.ts", rule: "shell", cwe: "CWE-78", line: 3 },
            { path: "src/eval.ts", rule: "eval" },
          ],
          longFiles: [
            { path: "src/big.ts", lines: 320, before: 280, limit: 300, severity: "warning" },
          ],
          removedAssertions: [
            { path: "a.test.ts", removed: 3 },
            { path: "b.test.ts", removed: 2 },
          ],
        }),
      ]),
      row("other", [created(at(2, 8)), sent(at(2, 9), ["a.test.ts"])]),
      row("bug", [created(at(2, 8)), locked(at(2, 9), ["bug.test.ts"])], "quick"),
    ];
    const quality = qualityOf(panel(rows));
    expect(quality.tests).toEqual({ proposed: 4, locked: 1 });
    expect(quality.risks).toBe(2);
    expect(quality.longFiles).toBe(1);
    expect(quality.removedAssertions).toBe(5);
  });

  it("AC7: up to five changes with most task verifications failed in the period, the most first", () => {
    const failing = (id: string, failed: number, passed: number) =>
      row(id, [
        created(at(31, 8)),
        // Before the period: it does not count.
        verified(at(30), 1),
        ...Array.from({ length: failed }, (_, index) => verified(at(2, 9, index), 1)),
        ...Array.from({ length: passed }, (_, index) => verified(at(2, 10, index), 0)),
      ]);
    const rows = [
      failing("one", 1, 4),
      failing("six", 6, 0),
      failing("two", 2, 1),
      failing("three-a", 3, 1),
      failing("three-b", 3, 5),
      failing("four", 4, 0),
      failing("none", 0, 7),
    ];
    expect(qualityOf(panel(rows)).worst).toEqual([
      { id: "six", failed: 6, total: 6 },
      { id: "four", failed: 4, total: 4 },
      // On a tie, the one with more verifications first.
      { id: "three-b", failed: 3, total: 8 },
      { id: "three-a", failed: 3, total: 4 },
      { id: "two", failed: 2, total: 3 },
    ]);
    expect(qualityOf(panel([failing("none", 0, 3)])).worst).toEqual([]);
  });

  it("AC7: only the changes of the cut count, in the flow and in the quality", () => {
    const rows = [
      row("feature", [
        created(at(3, 8)),
        proposed(at(3, 9)),
        approved(at(3, 10), "tty"),
        verified(at(3, 11), 1),
        full(at(3, 12), 1),
      ]),
      row(
        "quick",
        [
          created(at(2, 8)),
          proposed(at(2, 9)),
          approved(at(2, 10), "delegated"),
          verified(at(2, 11), 0),
          full(at(2, 12), 0),
        ],
        "quick",
      ),
    ];
    const view = panel(rows, { kind: "quick" });
    expect(flowOf(view).approvals).toEqual({ delegated: 1, tty: 0, ui: 0 });
    expect(qualityOf(view).full).toEqual({ failed: 0, total: 1 });
    expect(qualityOf(view).worst).toEqual([]);
  });
});
