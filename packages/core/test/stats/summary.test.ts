// SPDX-License-Identifier: Apache-2.0
// The panel's figures (docs/ui.md, «Panel»): a row per change from its state and its audit, the
// cut the URL asks for, and the six figures of the period compared with the one before.
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

describe("the panel's figures", () => {
  it("AC1: gives the six figures of the last 30 days, each compared with the 30 days before", () => {
    const rows = [
      // Closed in the period: 1 h, 3 h and 5 h from created to closed.
      row(
        "20261101-uno",
        "standard",
        [
          line(at(3, 9), "change.created", { tool: "claude-code" }),
          line(at(3, 9, 30), "task.completed"),
          verified(at(3, 9, 30), 0),
          verified(at(3, 9, 40), 1),
          usage(at(3, 10), 2.5),
          line(at(3, 10), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      row(
        "20261102-dos",
        "standard",
        [
          line(at(2, 8), "change.created", { tool: "claude-code" }),
          line(at(2, 9), "task.completed"),
          line(at(2, 10), "task.completed"),
          verified(at(2, 10), 0),
          usage(at(2, 11)),
          line(at(2, 11), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      row(
        "20261103-tres",
        "quick",
        [
          line(at(1, 6), "change.created", { tool: "codex" }),
          line(at(1, 11), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      // Closed in the 30 days before: 2 h, with one verification that passed and a cost.
      row(
        "20260920-antes",
        "standard",
        [
          line(at(40, 8), "change.created", { tool: "claude-code" }),
          line(at(40, 9), "task.completed"),
          verified(at(40, 9), 0),
          usage(at(40, 10), 1),
          line(at(40, 10), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
    ];
    const memory = [
      entry("P1", "pending", "open", 50),
      entry("P2", "improvement", "done", 40, { closed: { at: at(10), by: "Ana" } }),
      entry("P3", "reminder", "open", 1),
      entry("P4", "pending", "taken", 5, { taken: { change: "20261101-uno", at: at(4) } }),
      entry("D1", "decision", "open", 20, { quote: "Así" }),
      entry("P5", "pending", "dropped", 45),
    ];
    const { summary } = statsView({ rows, memory, today: TODAY, query: statsQuery({}) });
    expect(summary.closed).toEqual({ value: 3, previous: 1, change: 2 });
    expect(summary.tasks).toEqual({ value: 3, previous: 1, change: 2 });
    expect(summary.cycle).toEqual({ value: 3 * HOUR, previous: 2 * HOUR, change: 0.5 });
    expect(summary.verifications.value).toBeCloseTo(2 / 3);
    expect(summary.verifications.count).toBe(3);
    expect(summary.verifications.previous).toBe(1);
    expect(summary.verifications.change).toBeCloseTo(-1 / 3);
    expect(summary.cost).toEqual({ value: 2.5, previous: 1, change: 1.5, measured: 1, of: 3 });
    // Open at the end of each period: P1, P3 and P4 now; P1 and P2 then.
    expect(summary.pending).toEqual({ value: 3, previous: 2, change: 0.5 });
  });

  it("AC1: says the 30 days before have no data when they have none, and gives no figure without one", () => {
    const rows = [
      row(
        "20261105-solo",
        "standard",
        [line(at(2), "change.created", { tool: "codex" }), line(at(1), "task.completed")],
        "Ana",
      ),
    ];
    const { summary } = statsView({ rows, memory: [], today: TODAY, query: statsQuery({}) });
    expect(summary.closed).toEqual({ value: 0, previous: 0, change: null });
    expect(summary.tasks).toEqual({ value: 1, previous: 0, change: null });
    expect(summary.cycle).toEqual({ value: null, previous: null, change: null });
    expect(summary.verifications).toEqual({ value: null, previous: null, change: null, count: 0 });
    expect(summary.cost).toEqual({
      value: null,
      previous: null,
      change: null,
      measured: 0,
      of: 0,
    });
    expect(summary.pending).toEqual({ value: 0, previous: 0, change: null });
  });

  it("AC3: with «Todo», from the day of the first change and with no comparison", () => {
    const rows = [
      row(
        "20260301-viejo",
        "standard",
        [
          line(at(200), "change.created", { tool: "codex" }),
          line(at(199), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      row(
        "20261106-nuevo",
        "quick",
        [
          line(at(1), "change.created", { tool: "codex" }),
          line(at(1), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
    ];
    const view = statsView({
      rows,
      memory: [],
      today: TODAY,
      query: statsQuery({ period: "all" }),
    });
    expect(view.query).toEqual({ period: "all" });
    expect(view.range).toEqual({ from: "2026-04-21", to: TODAY });
    expect(view).not.toHaveProperty("previous");
    expect(view.summary.closed).toEqual({ value: 2 });
    expect(view.summary.tasks).toEqual({ value: 0 });
    expect(view.summary.pending).toEqual({ value: 0 });
    expect(view.summary.verifications).toEqual({ value: null, count: 0 });
    expect(view.summary.cost).toEqual({ value: null, measured: 0, of: 2 });
  });

  it("AC6: counts each change for one person, one agent and one model, or for «(sin dato)»", () => {
    const approvedOne = row(
      "20261101-a",
      "standard",
      [
        line(at(6), "change.created", { tool: "codex", model: "m-1", by: "Otro" }),
        line(at(6), "spec.proposed", { tool: "claude-code", model: "m-2" }),
        line(at(5), "task.completed", { tool: "claude-code", model: "m-2" }),
        line(at(5), "change.closed", { actor: "human", by: "Otro" }),
      ],
      "Ana",
    );
    expect(approvedOne).toMatchObject({ person: "Ana", agent: "claude-code", model: "m-2" });
    // Without an approval, the last `by` of its audit; without a tool nor a model, no data.
    const unapproved = row("20261101-b", "quick", [
      line(at(4), "change.created", { by: "Bea" }),
      line(at(3), "change.closed", { actor: "human", by: "Carla" }),
    ]);
    expect(unapproved.person).toBe("Carla");
    expect(unapproved).not.toHaveProperty("agent");
    expect(unapproved).not.toHaveProperty("model");
    // A tie goes to the one that appears first; the person's lines name no agent.
    const tied = row(
      "20261101-c",
      "standard",
      [
        line(at(4), "change.created", { tool: "codex", model: "x" }),
        line(at(3), "spec.proposed", { tool: "gemini", model: "y" }),
        line(at(3), "spec.approved", { actor: "human", tool: "gemini", by: "Ana" }),
      ],
      "Ana",
    );
    expect(tied).toMatchObject({ agent: "codex", model: "x" });
    // A change with no audit line has no row.
    expect(statsRow({ id: "20261101-d", kind: "standard" }, [])).toBeUndefined();

    const rows = [approvedOne, unapproved, tied];
    const view = statsView({ rows, memory: [], today: TODAY, query: statsQuery({}) });
    expect(view.options).toEqual([
      { who: { kind: "person", name: "Ana" }, changes: 2 },
      { who: { kind: "person", name: "Carla" }, changes: 1 },
      { who: { kind: "agent", name: "claude-code" }, changes: 1 },
      { who: { kind: "agent", name: "codex" }, changes: 1 },
      { who: { kind: "agent", name: "" }, changes: 1 },
      { who: { kind: "model", name: "m-2" }, changes: 1 },
      { who: { kind: "model", name: "x" }, changes: 1 },
      { who: { kind: "model", name: "" }, changes: 1 },
    ]);
    const noModel = statsView({
      rows,
      memory: [],
      today: TODAY,
      query: statsQuery({ who: "model:" }),
    });
    expect(noModel.query).toEqual({ period: "30d", who: { kind: "model", name: "" } });
    expect(noModel.changes).toBe(1);
    expect(noModel.summary.closed.value).toBe(1);
    const quick = statsView({
      rows,
      memory: [],
      today: TODAY,
      query: statsQuery({ kind: "quick" }),
    });
    expect(quick.query).toEqual({ period: "30d", kind: "quick" });
    expect(quick.summary.closed.value).toBe(1);
    expect(quick.summary.tasks.value).toBe(0);
  });

  it("AC6: counts each fact by the local day of its event and compares with the days just before of the same length", () => {
    const rows = [
      // Created before the period: its task of the period counts, and the earlier one, before.
      row(
        "20260925-largo",
        "standard",
        [
          line(at(40), "change.created", { tool: "codex" }),
          line(at(35), "task.completed"),
          line(at(3), "task.completed"),
          line(at(2), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      // Closed at 23:30 of the day before the week, and at 00:30 of its first day.
      row(
        "20261031-tarde",
        "quick",
        [
          line(at(8, 20), "change.created", { tool: "codex" }),
          line(at(7, 23, 30), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      row(
        "20261031-pronto",
        "quick",
        [
          line(at(7, 20), "change.created", { tool: "codex" }),
          line(at(6, 0, 30), "change.closed", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
      // A retro closes with its `retro.confirmed`; a cancelled change does not close.
      row(
        "20261104-retro",
        "retro",
        [
          line(at(3), "change.created", { tool: "codex" }),
          line(at(3), "retro.confirmed", { data: { mode: "agent" } }),
        ],
        "Ana",
      ),
      row(
        "20261104-cancelado",
        "standard",
        [
          line(at(3), "change.created", { tool: "codex" }),
          line(at(2), "change.cancelled", { actor: "human", by: "Ana" }),
        ],
        "Ana",
      ),
    ];
    const month = statsView({ rows, memory: [], today: TODAY, query: statsQuery({}) });
    expect(month.range).toEqual({ from: "2026-10-09", to: TODAY });
    expect(month.previous).toEqual({ from: "2026-09-09", to: "2026-10-08" });
    expect(month.summary.closed.value).toBe(4);
    expect(month.summary.tasks).toEqual({ value: 1, previous: 1, change: 0 });
    // Every change lived in the month; only the long one lived in the 30 days before.
    expect(month.changes).toBe(5);

    const week = statsView({ rows, memory: [], today: TODAY, query: statsQuery({ period: "7d" }) });
    expect(week.query).toEqual({ period: "7d" });
    expect(week.range).toEqual({ from: "2026-11-01", to: TODAY });
    expect(week.previous).toEqual({ from: "2026-10-25", to: "2026-10-31" });
    expect(week.summary.closed).toEqual({ value: 3, previous: 1, change: 2 });

    const quarter = statsView({
      rows,
      memory: [],
      today: TODAY,
      query: statsQuery({ period: "90d" }),
    });
    expect(quarter.range).toEqual({ from: "2026-08-10", to: TODAY });
    expect(quarter.previous).toEqual({ from: "2026-05-12", to: "2026-08-09" });
    expect(quarter.summary.tasks).toEqual({ value: 2, previous: 0, change: null });

    // No change of the cut lived in a period: none to show.
    const nobody = statsView({
      rows,
      memory: [],
      today: TODAY,
      query: statsQuery({ who: "person:Nadie" }),
    });
    expect(nobody.changes).toBe(0);
  });

  it("AC6: with a filter, a memory entry counts if it was noted in a change of the cut", () => {
    const rows = [
      row("20261101-ana", "standard", [line(at(5), "change.created", { tool: "codex" })], "Ana"),
      row("20261101-bea", "quick", [line(at(5), "change.created", { tool: "gemini" })], "Bea"),
    ];
    const memory = [
      entry("P1", "pending", "open", 4, { origin: { by: "codex", change: "20261101-ana" } }),
      entry("P2", "pending", "open", 4, { origin: { by: "gemini", change: "20261101-bea" } }),
      entry("P3", "improvement", "open", 4, { origin: { by: "person" } }),
    ];
    const pending = (who?: string, kind?: string) =>
      statsView({ rows, memory, today: TODAY, query: statsQuery({ who, kind }) }).summary.pending
        .value;
    expect(pending()).toBe(3);
    expect(pending("person:Ana")).toBe(1);
    expect(pending("agent:gemini")).toBe(1);
    expect(pending(undefined, "quick")).toBe(1);
    expect(pending("model:")).toBe(2);
  });

  it("AC6: understands the cut of the URL, and takes the default for what it does not", () => {
    expect(statsQuery({})).toEqual({ period: "30d" });
    expect(statsQuery({ period: "90d", who: "agent:codex", kind: "epic" })).toEqual({
      period: "90d",
      who: { kind: "agent", name: "codex" },
      kind: "epic",
    });
    expect(statsQuery({ who: "person:Ana: la de QA" })).toEqual({
      period: "30d",
      who: { kind: "person", name: "Ana: la de QA" },
    });
    expect(statsQuery({ period: "1y", who: "nadie", kind: "bug" })).toEqual({ period: "30d" });
    expect(statsQuery({ period: null, who: "team:x", kind: null })).toEqual({ period: "30d" });
  });

  it("AC8: aggregates 2,000 synthetic changes in under a second", () => {
    const kinds: readonly ChangeKind[] = ["standard", "quick", "epic", "retro"];
    const started = Date.now();
    const rows = Array.from({ length: 2_000 }, (_, index) => {
      const days = index % 120;
      const lines: Line[] = [
        line(at(days + 1, 9), "change.created", {
          tool: index % 3 === 0 ? "codex" : "claude-code",
          model: `m-${index % 4}`,
        }),
      ];
      for (let task = 0; task < 6; task++) {
        lines.push(line(at(days, 10, task), "task.started"));
        lines.push(verified(at(days, 10, task), index % 7 === 0 ? 1 : 0));
        lines.push(line(at(days, 10, task), "task.completed"));
      }
      lines.push(usage(at(days, 11), index % 2 === 0 ? 1.25 : undefined));
      lines.push(line(at(days, 11), "change.closed", { actor: "human", by: `P${index % 5}` }));
      return row(
        `20260101-c${index}`,
        kinds[index % kinds.length] ?? "standard",
        lines,
        `P${index % 5}`,
      );
    });
    const memory = Array.from({ length: 300 }, (_, index) =>
      entry(`P${index + 1}`, "pending", index % 3 === 0 ? "done" : "open", index % 90, {
        origin: { by: "codex", change: `20260101-c${index}` },
        ...(index % 3 === 0 ? { closed: { at: at(index % 30), by: "Ana" } } : {}),
      }),
    );
    for (const period of ["7d", "30d", "90d", "all"]) {
      const view = statsView({ rows, memory, today: TODAY, query: statsQuery({ period }) });
      expect(view.summary.closed.value).toBeGreaterThan(0);
    }
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
