// SPDX-License-Identifier: Apache-2.0
// The panel's «Ritmo» and «Personas y agentes» (docs/ui.md, «Panel»): the changes closed by lane
// and the tasks completed, by day or by week, and a row per person, agent and model.
import { describe, expect, it } from "vitest";
import { type ChangeKind, type StatsRow, statsQuery, statsRow, statsView } from "../../src";

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

const approved = (by: string) => ({
  revision: 1,
  hash: `sha256:${"a".repeat(64)}`,
  at: at(60),
  by,
  channel: "tty" as const,
});

/** The row of a change approved by `by`, or with no approval when `by` is none. */
function row(id: string, kind: ChangeKind, lines: readonly Line[], by?: string): StatsRow {
  const found = statsRow(
    { id, kind, ...(by === undefined ? {} : { approved: approved(by) }) },
    lines,
  );
  if (found === undefined) throw new Error(`no row for ${id}`);
  return found;
}

const verified = (ts: string, exit: number, extra: Line = {}) =>
  line(ts, "task.verified", { actor: "specty", data: { task: "T1", exit }, ...extra });
const usage = (ts: string, cost: number) =>
  line(ts, "change.usage", { actor: "specty", data: { calls: 3, input: 1, output: 2, cost } });

/** The panel of `rows` for the cut that `params` ask for, as of today. */
const panel = (rows: readonly StatsRow[], params: Parameters<typeof statsQuery>[0] = {}) =>
  statsView({ rows, memory: [], today: TODAY, query: statsQuery(params) });

/** Each lane with its closed changes: the ones not given, 0. */
const lanes = (counts: Partial<Record<ChangeKind, number>> = {}) => ({
  quick: 0,
  standard: 0,
  spike: 0,
  retro: 0,
  epic: 0,
  ...counts,
});

const HOUR = 3_600_000;

/** A change that closed `days` ago, at noon, created the day before. */
const closedOn = (id: string, kind: ChangeKind, days: number) =>
  row(id, kind, [
    line(at(days + 1), "change.created", { tool: "claude-code" }),
    line(at(days), "task.completed", { tool: "claude-code" }),
    line(at(days), "change.closed", { actor: "human", by: "Ana" }),
  ]);

describe("the panel's rhythm", () => {
  it("AC8: counts each change closed on its day, by lane, and each task on its own, day by day in 30 days", () => {
    const rows = [
      row("20261020-uno", "standard", [
        line(at(18, 9), "change.created", { tool: "claude-code" }),
        line(at(3, 9), "task.completed", { tool: "claude-code" }),
        line(at(3, 9, 30), "task.completed", { tool: "claude-code" }),
        line(at(3, 10), "change.closed", { actor: "human", by: "Ana" }),
      ]),
      row("20261102-dos", "quick", [
        line(at(5, 9), "change.created", { tool: "claude-code" }),
        line(at(3, 11), "change.closed", { actor: "human", by: "Ana" }),
      ]),
      // A retro closes when it is confirmed.
      row("20261105-retro", "retro", [
        line(at(2, 9), "change.created", { tool: "claude-code" }),
        line(at(1, 9), "retro.confirmed", { actor: "human", by: "Ana" }),
      ]),
      // Closed the day before the period: neither it nor its task count.
      row("20261001-viejo", "standard", [
        line(at(35), "change.created", { tool: "claude-code" }),
        line(at(30, 9), "task.completed", { tool: "claude-code" }),
        line(at(30, 10), "change.closed", { actor: "human", by: "Ana" }),
      ]),
      // Still open: its task counts on its day.
      row("20261107-abierto", "epic", [
        line(at(0, 8), "change.created", { tool: "claude-code" }),
        line(at(0, 9), "task.completed", { tool: "claude-code" }),
      ]),
    ];
    const rhythm = panel(rows).rhythm;
    expect(rhythm?.unit).toBe("day");
    expect(rhythm?.buckets).toHaveLength(30);
    expect(rhythm?.buckets[0]).toEqual({
      from: "2026-10-09",
      to: "2026-10-09",
      closed: lanes(),
      tasks: 0,
    });
    const day = (from: string) => rhythm?.buckets.find((bucket) => bucket.from === from);
    expect(day("2026-11-04")).toEqual({
      from: "2026-11-04",
      to: "2026-11-04",
      closed: lanes({ standard: 1, quick: 1 }),
      tasks: 2,
    });
    expect(day("2026-11-06")?.closed).toEqual(lanes({ retro: 1 }));
    expect(day("2026-11-07")).toEqual({
      from: "2026-11-07",
      to: "2026-11-07",
      closed: lanes(),
      tasks: 1,
    });
    const closed = (rhythm?.buckets ?? []).flatMap((bucket) => Object.values(bucket.closed));
    expect(closed.reduce((total, count) => total + count, 0)).toBe(3);
    expect((rhythm?.buckets ?? []).reduce((total, bucket) => total + bucket.tasks, 0)).toBe(3);
  });

  it("AC8: goes by day in 7 days and in 45, and week by week from Monday above 45 days", () => {
    const week = panel([closedOn("20261105-uno", "standard", 2)], { period: "7d" }).rhythm;
    expect(week?.unit).toBe("day");
    expect(week?.buckets.map((bucket) => bucket.from)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);

    // «Todo» from a first change 44 days ago spans 45 days; one day more, 46.
    const days = panel([closedOn("20260924-uno", "quick", 43)], { period: "all" }).rhythm;
    expect(days?.unit).toBe("day");
    expect(days?.buckets).toHaveLength(45);
    expect(days?.buckets[0]?.from).toBe("2026-09-24");
    const weeks = panel([closedOn("20260923-uno", "quick", 44)], { period: "all" }).rhythm;
    expect(weeks?.unit).toBe("week");
  });

  it("AC8: by week, each one from Monday to Sunday, the first and the last cut to the period", () => {
    const rows = [
      closedOn("20261103-uno", "standard", 3),
      closedOn("20261103-dos", "quick", 3),
      // Sunday 1 November closes the week of Monday 26 October.
      closedOn("20261031-tres", "spike", 6),
    ];
    const quarter = panel(rows, { period: "90d" }).rhythm;
    expect(quarter?.unit).toBe("week");
    expect(quarter?.buckets).toHaveLength(13);
    expect(quarter?.buckets[0]).toMatchObject({ from: "2026-08-10", to: "2026-08-16" });
    expect(quarter?.buckets.at(-2)).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
      closed: lanes({ spike: 1 }),
      tasks: 1,
    });
    expect(quarter?.buckets.at(-1)).toEqual({
      from: "2026-11-02",
      to: "2026-11-07",
      closed: lanes({ standard: 1, quick: 1 }),
      tasks: 2,
    });

    // «Todo» from Tuesday 21 April: its first week starts that day.
    const first = row("20260421-viejo", "epic", [
      line(at(200), "change.created", { tool: "claude-code" }),
      line(at(193), "task.completed", { tool: "claude-code" }),
      line(at(193), "change.closed", { actor: "human", by: "Ana" }),
    ]);
    const all = panel([...rows, first], { period: "all" }).rhythm;
    expect(all?.unit).toBe("week");
    expect(all?.buckets).toHaveLength(29);
    expect(all?.buckets[0]).toEqual({
      from: "2026-04-21",
      to: "2026-04-26",
      closed: lanes(),
      tasks: 0,
    });
    expect(all?.buckets[1]).toMatchObject({ from: "2026-04-27", to: "2026-05-03", tasks: 1 });
    expect(all?.buckets[1]?.closed).toEqual(lanes({ epic: 1 }));
  });

  it("AC8: counts only the changes of the cut: its person, agent or model, and its lane", () => {
    const rows = [
      closedOn("20261103-uno", "standard", 3),
      closedOn("20261103-dos", "quick", 3),
      row(
        "20261103-tres",
        "quick",
        [
          line(at(4), "change.created", { tool: "codex" }),
          line(at(3), "change.closed", { actor: "human", by: "Luis" }),
        ],
        "Luis",
      ),
    ];
    const day = (params: Parameters<typeof statsQuery>[0]) =>
      panel(rows, params).rhythm?.buckets.find((bucket) => bucket.from === "2026-11-04");
    expect(day({})?.closed).toEqual(lanes({ standard: 1, quick: 2 }));
    expect(day({ kind: "quick" })?.closed).toEqual(lanes({ quick: 2 }));
    expect(day({ who: "person:Luis" })?.closed).toEqual(lanes({ quick: 1 }));
    expect(day({ who: "agent:claude-code", kind: "standard" })?.closed).toEqual(
      lanes({ standard: 1 }),
    );
  });
});

describe("the panel's people, agents and models", () => {
  /** Lines of the agent `tool`, with its `model` when it says it, in the session `session`. */
  const agent = (tool: string, session: string, model?: string): Line => ({
    tool,
    session,
    ...(model === undefined ? {} : { model }),
  });
  const rows = [
    // Ana with claude-code and m-1: closed in 2 h, one verification of two passing, $2.
    row(
      "20261028-uno",
      "standard",
      [
        line(at(10, 9), "change.created", agent("claude-code", "s1", "m-1")),
        line(at(10, 9, 30), "task.completed", agent("claude-code", "s1", "m-1")),
        verified(at(10, 9, 30), 0, { session: "s1" }),
        verified(at(10, 9, 40), 1, { session: "s1" }),
        usage(at(10, 10), 2),
        line(at(10, 11), "change.closed", { actor: "human", by: "Ana" }),
      ],
      "Ana",
    ),
    // Ana with claude-code and no model: closed in 4 h, in s1 again and in s2.
    row(
      "20261102-dos",
      "quick",
      [
        line(at(5, 8), "change.created", agent("claude-code", "s1")),
        line(at(5, 9), "task.completed", agent("claude-code", "s2")),
        verified(at(5, 9), 0, { session: "s2" }),
        line(at(5, 12), "change.closed", { actor: "human", by: "Ana" }),
      ],
      "Ana",
    ),
    // Luis with codex and m-1, still open: its session before the period does not count.
    row(
      "20260928-tres",
      "standard",
      [
        line(at(40, 8), "change.created", agent("codex", "s0", "m-1")),
        line(at(2, 9), "task.completed", agent("codex", "s3", "m-1")),
        line(at(2, 10), "task.completed", agent("codex", "s3", "m-1")),
      ],
      "Luis",
    ),
    // Luis again, but long before the period.
    row(
      "20260908-viejo",
      "standard",
      [
        line(at(60), "change.created", agent("codex", "s9", "m-1")),
        line(at(50), "change.closed", { actor: "human", by: "Luis" }),
      ],
      "Luis",
    ),
    // Nobody approved it nor decided anything in it: its person is «(sin dato)».
    row("20261106-cuatro", "standard", [line(at(1, 8), "change.created", agent("codex", "s4"))]),
  ];

  it("AC8: gives a row per person, agent and model of the period, «(sin dato)» too, in the order of «Ver por»", () => {
    const people = panel(rows).people;
    expect(people?.map((one) => one.who)).toEqual([
      { kind: "person", name: "Ana" },
      { kind: "person", name: "Luis" },
      { kind: "person", name: "" },
      { kind: "agent", name: "claude-code" },
      { kind: "agent", name: "codex" },
      { kind: "model", name: "m-1" },
      { kind: "model", name: "" },
    ]);
    const of = (kind: string, name: string) =>
      people?.find((one) => one.who.kind === kind && one.who.name === name);
    expect(of("person", "Ana")).toEqual({
      who: { kind: "person", name: "Ana" },
      changes: 2,
      tasks: 2,
      cycle: 3 * HOUR,
      verifications: 2 / 3,
      sessions: 2,
      cost: 2,
    });
    // Its change before the period does not count, nor does its session then.
    expect(of("person", "Luis")).toEqual({
      who: { kind: "person", name: "Luis" },
      changes: 1,
      tasks: 2,
      cycle: null,
      verifications: null,
      sessions: 1,
      cost: null,
    });
    expect(of("person", "")).toMatchObject({ changes: 1, tasks: 0, sessions: 1, cost: null });
    expect(of("agent", "claude-code")).toEqual({ ...of("person", "Ana"), who: expect.anything() });
    expect(of("agent", "codex")).toMatchObject({ changes: 2, tasks: 2, sessions: 2 });
    expect(of("model", "m-1")).toEqual({
      who: { kind: "model", name: "m-1" },
      changes: 2,
      tasks: 3,
      cycle: 2 * HOUR,
      verifications: 0.5,
      sessions: 2,
      cost: 2,
    });
    expect(of("model", "")).toEqual({
      who: { kind: "model", name: "" },
      changes: 2,
      tasks: 1,
      cycle: 4 * HOUR,
      verifications: 1,
      sessions: 3,
      cost: null,
    });
  });

  it("AC8: counts with the lane chosen, but without the «Ver por» filter", () => {
    const names = (params: Parameters<typeof statsQuery>[0]) =>
      panel(rows, params).people?.map(({ who }) => `${who.kind}:${who.name}`);
    expect(names({ who: "person:Ana" })).toEqual(names({}));
    expect(names({ kind: "quick" })).toEqual(["person:Ana", "agent:claude-code", "model:"]);
    const quick = panel(rows, { kind: "quick", who: "person:Luis" }).people?.[0];
    expect(quick).toMatchObject({ changes: 1, tasks: 1, cycle: 4 * HOUR, sessions: 2 });
    // In the last 7 days, codex has more changes than claude-code, and the first one is out.
    expect(names({ period: "7d" })).toEqual([
      "person:Ana",
      "person:Luis",
      "person:",
      "agent:codex",
      "agent:claude-code",
      "model:m-1",
      "model:",
    ]);
  });

  it("AC1: «Sesiones» is none when no line of their changes tells its session, and 0 when one does but not in the period", () => {
    const quiet = [
      // Eva with codex, which does not tell its session.
      row(
        "20261105-sin-sesion",
        "standard",
        [
          line(at(2, 8), "change.created", { tool: "codex", model: "m-2" }),
          line(at(2, 9), "task.completed", { tool: "codex", model: "m-2" }),
        ],
        "Eva",
      ),
      // Fede with claude-code, still open: its only session is before the period, and a
      // verification in it, which tells none, makes the change live in the period.
      row(
        "20260920-antes",
        "standard",
        [
          line(at(48), "change.created", agent("claude-code", "s8", "m-3")),
          verified(at(1), 0),
        ],
        "Fede",
      ),
    ];
    const sessions = (kind: string, name: string) =>
      panel(quiet).people?.find((one) => one.who.kind === kind && one.who.name === name)?.sessions;
    expect(sessions("person", "Eva")).toBeNull();
    expect(sessions("agent", "codex")).toBeNull();
    expect(sessions("model", "m-2")).toBeNull();
    expect(sessions("person", "Fede")).toBe(0);
    expect(sessions("agent", "claude-code")).toBe(0);
    expect(sessions("model", "m-3")).toBe(0);
  });
});
