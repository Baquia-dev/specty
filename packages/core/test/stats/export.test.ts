// SPDX-License-Identifier: Apache-2.0
// The panel's export (docs/ui.md, «Panel», «Exportar»): one row per change of the cut, with its
// figures, as a CSV that a spreadsheet opens or as JSON.
import { describe, expect, it } from "vitest";
import {
  type ChangeKind,
  type SizeLevel,
  type StatsListed,
  type StatsQuery,
  statsExport,
  statsExportQuery,
  statsQuery,
  statsRow,
} from "../../src";

/** The server's today, and a local time `days` before it, at `hour`:00. */
const TODAY = "2026-11-07";
const at = (days: number, hour = 12) => new Date(2026, 10, 7 - days, hour).toISOString();

/** The hours from `from` to `to`, with two decimals, as the CSV in `lang` writes the cycle. */
const hours = (from: string, to: string, lang: "es" | "en" = "es") => {
  const fixed = ((Date.parse(to) - Date.parse(from)) / 3_600_000).toFixed(2);
  return lang === "es" ? fixed.replace(".", ",") : fixed;
};

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
  readonly model?: string;
  /** Who closed it: its person. */
  readonly by?: string;
  /** Days before today it was created (at 9:00) and closed (at 11:00); open without `closed`. */
  readonly created: number;
  readonly closed?: number;
  readonly tasks?: number;
  readonly failed?: number;
  readonly passed?: number;
  readonly cost?: number;
}

/** The change's row for the export, from its audit, with its title and size. */
function listed(made: Made): StatsListed {
  const last = made.closed ?? made.created;
  const agent: Line = {
    ...(made.tool === undefined ? {} : { tool: made.tool }),
    ...(made.model === undefined ? {} : { model: made.model }),
  };
  const verified = (exit: number) =>
    line(at(last, 10), "task.verified", { actor: "specty", data: { task: "T1", exit } });
  const closing = made.kind === "retro" ? "retro.confirmed" : "change.closed";
  const lines = [
    line(at(made.created, 9), "change.created", agent),
    ...Array.from({ length: made.tasks ?? 0 }, () => line(at(last, 10), "task.completed", agent)),
    ...Array.from({ length: made.failed ?? 0 }, () => verified(1)),
    ...Array.from({ length: made.passed ?? 0 }, () => verified(0)),
    ...(made.cost === undefined
      ? []
      : [
          line(at(last, 10), "change.usage", {
            actor: "specty",
            data: { calls: 3, input: 1, output: 2, cost: made.cost },
          }),
        ]),
    ...(made.closed === undefined
      ? []
      : [
          line(at(made.closed, 11), closing, {
            ...agent,
            ...(made.by === undefined ? {} : { by: made.by }),
          }),
        ]),
  ];
  const row = statsRow({ id: made.id, kind: made.kind ?? "standard" }, lines);
  if (row === undefined) throw new Error(`no row for ${made.id}`);
  return { ...row, title: made.title, ...(made.size === undefined ? {} : { size: made.size }) };
}

const ACCENTS = listed({
  id: "20261105-aviso-de-acentos",
  title: 'Aviso, "acentos" y más',
  size: "M",
  tool: "claude-code",
  model: "claude-opus-4-5",
  by: "Ana",
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
  by: "Bea",
  created: 6,
  closed: 6,
  tasks: 1,
  cost: 0.5,
});
const EPIC = listed({
  id: "20261020-epica-del-panel",
  title: "Épica del panel",
  kind: "epic",
  by: "Carla",
  created: 18,
  closed: 10,
});
const OPEN = listed({
  id: "20261106-tabla-abierta",
  title: "Tabla abierta",
  size: "L",
  tool: "claude-code",
  created: 1,
  tasks: 2,
});
const OLD = listed({
  id: "20260908-cambio-viejo",
  title: "Cambio viejo",
  size: "XL",
  tool: "codex",
  by: "Ana",
  created: 60,
  closed: 50,
  tasks: 4,
});
const ROWS = [OLD, OPEN, EPIC, SEARCH, ACCENTS];

const HEADER_ES =
  "Cambio;Título;Carril;Tamaño;Persona;Agente;Modelo;Creado;Cerrado;Tareas;Ciclo (horas);Verificaciones;Verificaciones fallidas;Coste (USD)";
const HEADER_EN =
  "Change,Title,Lane,Size,Person,Agent,Model,Created,Closed,Tasks,Cycle (hours),Verifications,Failed verifications,Cost (USD)";

/** The export of `rows` for the cut `query` asks for, in `format` and `lang`. */
function exported(
  query: StatsQuery,
  format: "csv" | "json",
  lang: "es" | "en" = "es",
  rows: readonly StatsListed[] = ROWS,
) {
  return statsExport({ rows, today: TODAY, query, ...statsExportQuery({ format, lang }, "es") });
}

/** The CSV's lines, without its BOM and without the empty one after the last CRLF. */
function csvLines(content: string): readonly string[] {
  expect(content.startsWith("\uFEFF")).toBe(true);
  expect(content.endsWith("\r\n")).toBe(true);
  return content.slice(1, -2).split("\r\n");
}

describe("the panel's export", () => {
  it("AC1: gives, as a CSV named by its period, a header and one row per change of the cut, the last closed first and the open ones last", () => {
    const file = exported(statsQuery({}), "csv");
    expect(file.name).toBe("specty-stats-2026-10-09-2026-11-07.csv");
    expect(file.type).toBe("text/csv; charset=utf-8");
    expect(csvLines(file.content)).toEqual([
      HEADER_ES,
      `20261105-aviso-de-acentos;"Aviso, ""acentos"" y más";Feature;M;Ana;Claude Code;claude-opus-4-5;2026-11-04 09:00;2026-11-05 11:00;3;${hours(at(3, 9), at(2, 11))};3;2;1,25`,
      `20261101-busqueda-rapida;Búsqueda rápida;Quick;S;Bea;Codex;;2026-11-01 09:00;2026-11-01 11:00;1;${hours(at(6, 9), at(6, 11))};0;0;0,50`,
      `20261020-epica-del-panel;Épica del panel;Épica;;Carla;;;2026-10-20 09:00;2026-10-28 11:00;0;${hours(at(18, 9), at(10, 11))};0;0;`,
      "20261106-tabla-abierta;Tabla abierta;Feature;L;;Claude Code;;2026-11-06 09:00;;2;;0;0;",
    ]);
  });

  it("AC1: takes the changes of the period, the person, agent or model and the lane in sight", () => {
    const ids = (query: StatsQuery) =>
      csvLines(exported(query, "csv").content)
        .slice(1)
        .map((row) => row.split(";")[0]);
    expect(ids(statsQuery({ period: "7d" }))).toEqual([ACCENTS.id, SEARCH.id, OPEN.id]);
    expect(ids(statsQuery({ period: "90d", who: "person:Ana" }))).toEqual([ACCENTS.id, OLD.id]);
    expect(ids(statsQuery({ period: "all", who: "agent:codex", kind: "quick" }))).toEqual([
      SEARCH.id,
    ]);
    expect(exported(statsQuery({ period: "7d" }), "csv").name).toBe(
      "specty-stats-2026-11-01-2026-11-07.csv",
    );
    // A cut without changes gives the header alone.
    expect(exported(statsQuery({ who: "person:Nadie" }), "csv").content).toBe(
      `\uFEFF${HEADER_ES}\r\n`,
    );
  });

  it("AC1: names each lane as its badge does", () => {
    const lanes: readonly ChangeKind[] = ["standard", "quick", "epic", "spike", "retro"];
    const rows = lanes.map((kind, index) =>
      listed({ id: `2026110${index + 1}-${kind}`, title: kind, kind, created: 5, closed: 5 }),
    );
    const named = (lang: "es" | "en") =>
      csvLines(exported(statsQuery({}), "csv", lang, rows).content)
        .slice(1)
        .map((row) =>
          row
            .split(lang === "es" ? ";" : ",")
            .slice(1, 3)
            .join(":"),
        );
    expect(named("es").toSorted()).toEqual([
      "epic:Épica",
      "quick:Quick",
      "retro:Manual",
      "spike:Spike",
      "standard:Feature",
    ]);
    expect(named("en").toSorted()).toEqual([
      "epic:Epic",
      "quick:Quick",
      "retro:Manual",
      "spike:Spike",
      "standard:Feature",
    ]);
  });

  it("AC2: a cell that starts as a formula would goes as text, after an apostrophe", () => {
    const titles = ["=2+3 en la tabla", "+34 600 000 000", "-1 día de ciclo", "@ana revisa"];
    const rows = titles.map((title, index) =>
      listed({ id: `2026110${index + 1}-formula`, title, created: 5, closed: 5 }),
    );
    const cells = csvLines(exported(statsQuery({}), "csv", "es", rows).content)
      .slice(1)
      .map((row) => row.split(";")[1]);
    expect(cells.toSorted()).toEqual([
      "'+34 600 000 000",
      "'-1 día de ciclo",
      "'=2+3 en la tabla",
      "'@ana revisa",
    ]);
  });

  it("separates the cells with semicolons and writes the decimals with a comma in Spanish, as Excel in Spanish reads them, and with commas and points in English", () => {
    const rows = [
      listed({ id: "20261102-coma", title: "Uno, dos", created: 5, closed: 5, cost: 12.5 }),
      listed({ id: "20261103-punto-y-coma", title: "Tres; cuatro", created: 4, closed: 4 }),
    ];
    const lines = (lang: "es" | "en") =>
      csvLines(exported(statsQuery({}), "csv", lang, rows).content).slice(1);
    // A cell goes between quotes when it has the separator of its language, and only then.
    expect(lines("es")).toEqual([
      `20261103-punto-y-coma;"Tres; cuatro";Feature;;;;;2026-11-03 09:00;2026-11-03 11:00;0;${hours(at(4, 9), at(4, 11))};0;0;`,
      `20261102-coma;Uno, dos;Feature;;;;;2026-11-02 09:00;2026-11-02 11:00;0;${hours(at(5, 9), at(5, 11))};0;0;12,50`,
    ]);
    expect(lines("en")).toEqual([
      `20261103-punto-y-coma,Tres; cuatro,Feature,,,,,2026-11-03 09:00,2026-11-03 11:00,0,${hours(at(4, 9), at(4, 11), "en")},0,0,`,
      `20261102-coma,"Uno, dos",Feature,,,,,2026-11-02 09:00,2026-11-02 11:00,0,${hours(at(5, 9), at(5, 11), "en")},0,0,12.50`,
    ]);
  });

  it("AC3: gives, as JSON named by its period, the cut, its days and one row per change with the API's values", () => {
    const file = exported(statsQuery({}), "json");
    expect(file.name).toBe("specty-stats-2026-10-09-2026-11-07.json");
    expect(file.type).toBe("application/json; charset=utf-8");
    const parsed: unknown = JSON.parse(file.content);
    expect(file.content).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
    expect(parsed).toEqual({
      query: { period: "30d" },
      range: { from: "2026-10-09", to: "2026-11-07" },
      changes: [
        {
          id: ACCENTS.id,
          title: 'Aviso, "acentos" y más',
          kind: "standard",
          size: "M",
          person: "Ana",
          agent: "claude-code",
          model: "claude-opus-4-5",
          created: at(3, 9),
          closed: at(2, 11),
          tasks: 3,
          cycle: Date.parse(at(2, 11)) - Date.parse(at(3, 9)),
          verifications: 3,
          failed: 2,
          cost: 1.25,
        },
        {
          id: SEARCH.id,
          title: "Búsqueda rápida",
          kind: "quick",
          size: "S",
          person: "Bea",
          agent: "codex",
          created: at(6, 9),
          closed: at(6, 11),
          tasks: 1,
          cycle: Date.parse(at(6, 11)) - Date.parse(at(6, 9)),
          verifications: 0,
          failed: 0,
          cost: 0.5,
        },
        {
          id: EPIC.id,
          title: "Épica del panel",
          kind: "epic",
          person: "Carla",
          created: at(18, 9),
          closed: at(10, 11),
          tasks: 0,
          cycle: Date.parse(at(10, 11)) - Date.parse(at(18, 9)),
          verifications: 0,
          failed: 0,
        },
        {
          id: OPEN.id,
          title: "Tabla abierta",
          kind: "standard",
          size: "L",
          agent: "claude-code",
          created: at(1, 9),
          tasks: 2,
          verifications: 0,
          failed: 0,
        },
      ],
    });
    // The columns of the CSV, in its order.
    const first = JSON.parse(file.content).changes[0];
    expect(Object.keys(first)).toEqual([
      "id",
      "title",
      "kind",
      "size",
      "person",
      "agent",
      "model",
      "created",
      "closed",
      "tasks",
      "cycle",
      "verifications",
      "failed",
      "cost",
    ]);
    // The JSON is the same in both languages.
    expect(exported(statsQuery({}), "json", "en").content).toBe(file.content);
  });

  it("AC6: writes the CSV's header and lanes in English when the UI asks for it", () => {
    const lines = csvLines(exported(statsQuery({}), "csv", "en").content);
    expect(lines[0]).toBe(HEADER_EN);
    expect(lines[3]).toBe(
      `20261020-epica-del-panel,Épica del panel,Epic,,Carla,,,2026-10-20 09:00,2026-10-28 11:00,0,${hours(at(18, 9), at(10, 11), "en")},0,0,`,
    );
  });

  it("AC4: understands the format and the language, or takes their defaults: CSV and the repository's language", () => {
    expect(statsExportQuery({ format: "json", lang: "en" }, "es")).toEqual({
      format: "json",
      lang: "en",
    });
    expect(statsExportQuery({ format: "csv", lang: "es" }, "en")).toEqual({
      format: "csv",
      lang: "es",
    });
    expect(statsExportQuery({ format: "xlsx", lang: "fr" }, "es")).toEqual({
      format: "csv",
      lang: "es",
    });
    expect(statsExportQuery({ format: null, lang: null }, "en")).toEqual({
      format: "csv",
      lang: "en",
    });
    expect(statsExportQuery({}, "es")).toEqual({ format: "csv", lang: "es" });
  });
});
