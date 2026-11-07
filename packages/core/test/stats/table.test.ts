// SPDX-License-Identifier: Apache-2.0
// The panel's table of changes (docs/ui.md, «Panel», «Cambios»): the changes of the cut that
// lived in the period, each with its own figures, found by title or id, sorted by a column and
// cut into pages.
import { describe, expect, it } from "vitest";
import {
  type ChangeKind,
  type SizeLevel,
  type StatsChangeSort,
  type StatsListed,
  statsChanges,
  statsQuery,
  statsRow,
  statsTableQuery,
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

/** A change as the test writes it: days before today, and what it did. */
interface Made {
  readonly id: string;
  readonly title: string;
  readonly kind?: ChangeKind;
  readonly size?: SizeLevel;
  readonly tool?: string;
  /** Days before today it was created (at 9:00) and closed (at 11:00); open without `closed`. */
  readonly created: number;
  readonly closed?: number;
  readonly closedMinute?: number;
  readonly tasks?: number;
  readonly failed?: number;
  readonly passed?: number;
  readonly cost?: number;
}

/** The change's row for the table, from its audit, with its title and size. */
function listed(made: Made): StatsListed {
  const last = made.closed ?? made.created;
  const verified = (exit: number) =>
    line(at(last, 10), "task.verified", { actor: "specty", data: { task: "T1", exit } });
  const lines = [
    line(at(made.created, 9), "change.created", made.tool === undefined ? {} : { tool: made.tool }),
    ...Array.from({ length: made.tasks ?? 0 }, () => line(at(last, 10), "task.completed")),
    ...Array.from({ length: made.failed ?? 0 }, () => verified(1)),
    ...Array.from({ length: made.passed ?? 0 }, () => verified(0)),
    ...(made.cost === undefined
      ? []
      : [
          line(at(last, 10, 30), "change.usage", {
            actor: "specty",
            data: { calls: 3, input: 1, output: 2, cost: made.cost },
          }),
        ]),
    ...(made.closed === undefined
      ? []
      : [line(at(made.closed, 11, made.closedMinute ?? 0), "change.closed")]),
  ];
  const row = statsRow({ id: made.id, kind: made.kind ?? "standard" }, lines);
  if (row === undefined) throw new Error(`no row for ${made.id}`);
  return { ...row, title: made.title, ...(made.size === undefined ? {} : { size: made.size }) };
}

const ACCENTS = listed({
  id: "20261105-aviso-de-acentos",
  title: "Aviso de acentos en el título",
  size: "M",
  tool: "claude-code",
  created: 3,
  closed: 2,
  tasks: 3,
  failed: 2,
  passed: 1,
  cost: 1.25,
});
const SEARCH = listed({
  id: "20261101-busqueda-rapida",
  title: "Búsqueda rápida",
  kind: "quick",
  size: "S",
  tool: "codex",
  created: 6,
  closed: 6,
  tasks: 1,
});
const OPEN = listed({
  id: "20261106-tabla-abierta",
  title: "Tabla abierta",
  size: "L",
  tool: "claude-code",
  created: 1,
  tasks: 2,
});
const EPIC = listed({
  id: "20261020-epica-del-panel",
  title: "Épica del panel",
  kind: "epic",
  created: 18,
  closed: 10,
  cost: 0.5,
});
const OLD = listed({
  id: "20260908-cambio-viejo",
  title: "Cambio viejo",
  size: "XL",
  tool: "codex",
  created: 60,
  closed: 58,
});

const ROWS = [OLD, EPIC, SEARCH, ACCENTS, OPEN];

/** The table of `rows` for the URL's cut and table parameters, in Spanish. */
function table(
  cut: Parameters<typeof statsQuery>[0] = {},
  asked: Parameters<typeof statsTableQuery>[0] = {},
  rows: readonly StatsListed[] = ROWS,
) {
  return statsChanges({
    rows,
    today: TODAY,
    query: statsQuery(cut),
    table: statsTableQuery(asked, "es"),
  });
}

const ids = (page: ReturnType<typeof table>) => page.changes.map((change) => change.id);

const HOUR = 3_600_000;

describe("the panel's table of changes", () => {
  it("AC1: lists the changes of the cut that lived in the period, the last closed first and the open ones last, each with its figures", () => {
    const page = table();
    expect(page.query).toEqual({ period: "30d" });
    expect(page.range).toEqual({ from: "2026-10-09", to: TODAY });
    expect(page.table).toEqual({
      q: "",
      sort: "closed",
      dir: "desc",
      offset: 0,
      limit: 25,
      lang: "es",
    });
    // The old one lived before the period.
    expect(page.total).toBe(4);
    expect(ids(page)).toEqual([ACCENTS.id, SEARCH.id, EPIC.id, OPEN.id]);
    expect(page.changes[0]).toEqual({
      id: ACCENTS.id,
      title: "Aviso de acentos en el título",
      kind: "standard",
      size: "M",
      agent: "claude-code",
      closed: at(2, 11),
      tasks: 3,
      cycle: Date.parse(at(2, 11)) - Date.parse(at(3, 9)),
      failed: 2,
      cost: 1.25,
    });
    expect(page.changes[1]).toEqual({
      id: SEARCH.id,
      title: "Búsqueda rápida",
      kind: "quick",
      size: "S",
      agent: "codex",
      closed: at(6, 11),
      tasks: 1,
      cycle: 2 * HOUR,
      failed: 0,
    });
    // An epic with no agent nor size; an open change with no close, cycle nor cost.
    expect(page.changes[2]).toEqual({
      id: EPIC.id,
      title: "Épica del panel",
      kind: "epic",
      closed: at(10, 11),
      tasks: 0,
      cycle: Date.parse(at(10, 11)) - Date.parse(at(18, 9)),
      failed: 0,
      cost: 0.5,
    });
    expect(page.changes[3]).toEqual({
      id: OPEN.id,
      title: "Tabla abierta",
      kind: "standard",
      size: "L",
      agent: "claude-code",
      tasks: 2,
      failed: 0,
    });
  });

  it("AC1: lists only the changes of the person, agent, model or lane of the cut, and of a longer period", () => {
    expect(ids(table({ who: "agent:codex" }))).toEqual([SEARCH.id]);
    expect(ids(table({ kind: "epic" }))).toEqual([EPIC.id]);
    expect(ids(table({ who: "agent:" }))).toEqual([EPIC.id]);
    expect(ids(table({ period: "7d" }))).toEqual([ACCENTS.id, SEARCH.id, OPEN.id]);
    const all = table({ period: "all" });
    expect(all.query).toEqual({ period: "all" });
    expect(all.total).toBe(5);
    expect(ids(all)).toEqual([ACCENTS.id, SEARCH.id, EPIC.id, OLD.id, OPEN.id]);
  });

  it("AC2: finds the changes whose title or id has the search, ignoring case and accents", () => {
    const found = table({}, { q: "busqueda" });
    expect(found.table.q).toBe("busqueda");
    expect(ids(found)).toEqual([SEARCH.id]);
    expect(found.total).toBe(1);
    expect(ids(table({}, { q: "TABLA" }))).toEqual([OPEN.id]);
    expect(ids(table({}, { q: "ÉPICA" }))).toEqual([EPIC.id]);
    expect(ids(table({}, { q: "20261105" }))).toEqual([ACCENTS.id]);
    // The search looks only at the changes of the period.
    expect(table({}, { q: "viejo" }).total).toBe(0);
    const none = table({}, { q: "nada de esto" });
    expect(none.total).toBe(0);
    expect(none.changes).toEqual([]);
  });

  it("AC3: sorts by each column, both ways, with the changes that lack its value last and ties by id, the newest first", () => {
    const sorted = (sort: StatsChangeSort, dir: "asc" | "desc") => ids(table({}, { sort, dir }));
    expect(sorted("closed", "asc")).toEqual([EPIC.id, SEARCH.id, ACCENTS.id, OPEN.id]);
    expect(sorted("title", "asc")).toEqual([ACCENTS.id, SEARCH.id, EPIC.id, OPEN.id]);
    expect(sorted("title", "desc")).toEqual([OPEN.id, EPIC.id, SEARCH.id, ACCENTS.id]);
    // The lanes go in the filter's order: Feature, Quick, Épica, Spike and Manual.
    expect(sorted("kind", "asc")).toEqual([OPEN.id, ACCENTS.id, SEARCH.id, EPIC.id]);
    expect(sorted("kind", "desc")).toEqual([EPIC.id, SEARCH.id, OPEN.id, ACCENTS.id]);
    expect(sorted("size", "desc")).toEqual([OPEN.id, ACCENTS.id, SEARCH.id, EPIC.id]);
    expect(sorted("size", "asc")).toEqual([SEARCH.id, ACCENTS.id, OPEN.id, EPIC.id]);
    expect(sorted("agent", "asc")).toEqual([OPEN.id, ACCENTS.id, SEARCH.id, EPIC.id]);
    expect(sorted("agent", "desc")).toEqual([SEARCH.id, OPEN.id, ACCENTS.id, EPIC.id]);
    expect(sorted("tasks", "desc")).toEqual([ACCENTS.id, OPEN.id, SEARCH.id, EPIC.id]);
    expect(sorted("tasks", "asc")).toEqual([EPIC.id, SEARCH.id, OPEN.id, ACCENTS.id]);
    expect(sorted("cycle", "desc")).toEqual([EPIC.id, ACCENTS.id, SEARCH.id, OPEN.id]);
    expect(sorted("cycle", "asc")).toEqual([SEARCH.id, ACCENTS.id, EPIC.id, OPEN.id]);
    expect(sorted("failed", "desc")).toEqual([ACCENTS.id, OPEN.id, SEARCH.id, EPIC.id]);
    expect(sorted("cost", "desc")).toEqual([ACCENTS.id, EPIC.id, OPEN.id, SEARCH.id]);
    expect(sorted("cost", "asc")).toEqual([EPIC.id, ACCENTS.id, OPEN.id, SEARCH.id]);
  });

  it("AC3: starts each column in its natural direction: texts from A to Z, dates and figures from the most", () => {
    const natural = (sort: string) => statsTableQuery({ sort }, "es").dir;
    for (const sort of ["title", "kind", "agent"]) expect(natural(sort)).toBe("asc");
    for (const sort of ["closed", "size", "tasks", "cycle", "failed", "cost"])
      expect(natural(sort)).toBe("desc");
    expect(statsTableQuery({ sort: "title", dir: "desc" }, "es").dir).toBe("desc");
  });

  it("AC4: cuts the list into pages of 25, and says how many there are in all", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      listed({
        id: `20261106-cambio-${String(index).padStart(2, "0")}`,
        title: `Cambio ${index}`,
        tool: "codex",
        created: 1,
        closed: 0,
        closedMinute: index,
      }),
    );
    const first = table({}, {}, many);
    expect(first.total).toBe(30);
    expect(first.changes).toHaveLength(25);
    expect(first.changes[0]?.id).toBe("20261106-cambio-29");
    expect(first.changes[24]?.id).toBe("20261106-cambio-05");
    const second = table({}, { offset: "25" }, many);
    expect(second.table.offset).toBe(25);
    expect(second.total).toBe(30);
    expect(ids(second)).toEqual([
      "20261106-cambio-04",
      "20261106-cambio-03",
      "20261106-cambio-02",
      "20261106-cambio-01",
      "20261106-cambio-00",
    ]);
    expect(table({}, { offset: "10", limit: "5" }, many).changes).toHaveLength(5);
    expect(table({}, { offset: "40" }, many).changes).toEqual([]);
  });

  it("AC6: takes the default of each table value it does not understand, and the language it is given", () => {
    expect(
      statsTableQuery(
        { q: "panel", sort: "nope", dir: "up", offset: "-1", limit: "500", lang: "fr" },
        "en",
      ),
    ).toEqual({ q: "panel", sort: "closed", dir: "desc", offset: 0, limit: 25, lang: "en" });
    expect(statsTableQuery({ limit: "0" }, "es").limit).toBe(25);
    expect(statsTableQuery({ limit: "100", offset: "3" }, "es")).toMatchObject({
      limit: 100,
      offset: 3,
    });
    expect(statsTableQuery({ lang: "en" }, "es").lang).toBe("en");
    expect(statsTableQuery({ q: null, sort: null, dir: null }, "es")).toEqual({
      q: "",
      sort: "closed",
      dir: "desc",
      offset: 0,
      limit: 25,
      lang: "es",
    });
  });
});
