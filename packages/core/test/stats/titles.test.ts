// SPDX-License-Identifier: Apache-2.0
// The titles of the panel's lists (docs/ui.md, «Panel»): «Los cambios más caros» and «Cambios
// con más verificaciones fallidas» carry the title of each change when its row brings one.
import { describe, expect, it } from "vitest";
import { type StatsRow, type StatsView, statsQuery, statsRow, statsView } from "../../src";

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

/**
 * A change created four days ago and closed two days ago, that cost `cost` and failed `failed`
 * of its three task verifications, as `statsRow` reads it: without a title.
 */
function row(id: string, cost: number, failed: number): StatsRow {
  const found = statsRow({ id, kind: "standard" }, [
    line(at(4), "change.created", { tool: "claude-code" }),
    line(at(3), "task.completed", { data: { task: "T1" }, session: "s-1" }),
    ...[0, 1, 2].map((index) =>
      line(at(3, 13), "task.verified", {
        actor: "specty",
        data: { task: "T1", exit: index < failed ? 1 : 0 },
      }),
    ),
    line(at(2), "change.usage", { actor: "specty", data: { calls: 1, cost } }),
    line(at(2, 13), "change.closed", { actor: "human", by: "Ana" }),
  ]);
  if (found === undefined) throw new Error(`no row for ${id}`);
  return found;
}

/** The row with the title of its spec, as the server reads it. */
const titled = (one: StatsRow): StatsRow => ({ ...one, title: `El cambio ${one.id}` });

/** The panel of `rows` for the last 30 days, as of today. */
const panel = (rows: readonly StatsRow[]) =>
  statsView({ rows, memory: [], today: TODAY, query: statsQuery({}) });

function costOf(view: StatsView): NonNullable<StatsView["cost"]> {
  if (view.cost === undefined) throw new Error("no cost");
  return view.cost;
}

function qualityOf(view: StatsView): NonNullable<StatsView["quality"]> {
  if (view.quality === undefined) throw new Error("no quality");
  return view.quality;
}

/** Three changes: the costliest failed the least. */
const ROWS = [row("a", 3, 1), row("b", 1, 2), row("c", 2, 0)];

describe("the titles of the panel's lists", () => {
  it("AC3: with rows that bring their title, each of the costliest and of those that failed the most carries it, and no figure changes", () => {
    const plain = panel(ROWS);
    const named = panel(ROWS.map(titled));
    expect(costOf(named).top.map((change) => [change.id, change.title])).toEqual([
      ["a", "El cambio a"],
      ["c", "El cambio c"],
      ["b", "El cambio b"],
    ]);
    expect(qualityOf(named).worst.map((change) => [change.id, change.title])).toEqual([
      ["b", "El cambio b"],
      ["a", "El cambio a"],
    ]);
    // The same changes, in the same order and with the same figures, plus their title.
    expect(costOf(named).top).toEqual(
      costOf(plain).top.map((change) => ({ ...change, title: `El cambio ${change.id}` })),
    );
    expect(qualityOf(named).worst).toEqual(
      qualityOf(plain).worst.map((change) => ({ ...change, title: `El cambio ${change.id}` })),
    );
    // The rest of the panel does not change either.
    const rest = (view: StatsView) => ({ ...view, cost: undefined, quality: undefined });
    expect(rest(named)).toEqual(rest(plain));
  });

  it("AC3: with rows without a title, each change of the lists has only its id", () => {
    const plain = panel(ROWS);
    expect(costOf(plain).top.map((change) => change.id)).toEqual(["a", "c", "b"]);
    expect(qualityOf(plain).worst.map((change) => change.id)).toEqual(["b", "a"]);
    for (const change of [...costOf(plain).top, ...qualityOf(plain).worst]) {
      expect(change).not.toHaveProperty("title");
    }

    // A row with its title and one without, in the same cut.
    const mixed = panel([titled(row("a", 3, 1)), row("b", 1, 2), row("c", 2, 0)]);
    expect(costOf(mixed).top.map((change) => change.title)).toEqual([
      "El cambio a",
      undefined,
      undefined,
    ]);
    expect(costOf(mixed).top[1]).not.toHaveProperty("title");
    expect(qualityOf(mixed).worst.map((change) => change.title)).toEqual([
      undefined,
      "El cambio a",
    ]);
  });
});
