// SPDX-License-Identifier: Apache-2.0
// The panel's export (docs/ui.md, «Panel», «Exportar»): every change of the cut, one row each
// with the table's figures and who and when, as a CSV that a spreadsheet opens (RFC 4180 with the
// separator and the decimal mark of its language, UTF-8 with BOM) or as JSON. The local server
// answers it as `GET /api/stats/export`.
import { AGENT_NAMES, isAgentTool } from "../agents";
import { statsExportHeaders, statsLaneName } from "../cards/stats-export";
import { LANGS, type Lang } from "../i18n";
import { localDay } from "../memory/triggers";
import type { SizeLevel } from "../sizing/size";
import type { ChangeKind } from "../spec/model";
import type { StatsQuery } from "./period";
import { type StatsChange, type StatsListed, statsChanges, statsTableQuery } from "./table";

const FORMATS = ["csv", "json"] as const;
/** The formats of the export. */
export type StatsExportFormat = (typeof FORMATS)[number];

/** What the export asks for: its format, and the language of the CSV's header and lanes. */
export interface StatsExportQuery {
  readonly format: StatsExportFormat;
  readonly lang: Lang;
}

/** A change as the export gives it: the table's figures, its person and model, and its dates. */
export interface StatsExportRow {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  readonly size?: SizeLevel;
  readonly person?: string;
  /** The tool of its agent. */
  readonly agent?: string;
  readonly model?: string;
  /** ISO times it was created and closed; no `closed` while it is open. */
  readonly created: string;
  readonly closed?: string;
  readonly tasks: number;
  /** Milliseconds from created to closed; none while it is open. */
  readonly cycle?: number;
  /** Its task verifications, and those that failed. */
  readonly verifications: number;
  readonly failed: number;
  /** The US dollars measured; none when nothing measured it. */
  readonly cost?: number;
}

/** A column of the CSV: a key of the JSON's rows. */
export type StatsExportColumn = keyof StatsExportRow;

/** The columns, in the CSV's order. */
const COLUMNS: readonly StatsExportColumn[] = [
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
];

/** The file of the export: its name, its media type and its content. */
export interface StatsExportFile {
  readonly name: string;
  readonly type: string;
  readonly content: string;
}

/** The URL's parameters of the export, each one as it came, or none. */
interface ExportParams {
  readonly format?: string | null | undefined;
  readonly lang?: string | null | undefined;
}

/** The export that `params` ask for: each value understood, or its default: CSV and `lang`. */
export function statsExportQuery(params: ExportParams, lang: Lang): StatsExportQuery {
  return {
    format: FORMATS.find((known) => known === params.format) ?? "csv",
    lang: LANGS.find((known) => known === params.lang) ?? lang,
  };
}

/** What the export is made of: every change's row, the local today, the cut, and the export. */
interface ExportInput extends StatsExportQuery {
  readonly rows: readonly StatsListed[];
  /** YYYY-MM-DD, local. */
  readonly today: string;
  readonly query: StatsQuery;
}

/**
 * The file of the cut: the changes the table lists without a search (those whose life touches the
 * period), all of them, in its default order, named by the days of the period.
 */
export function statsExport({ rows, today, query, format, lang }: ExportInput): StatsExportFile {
  const table = { ...statsTableQuery({}, lang), limit: Number.POSITIVE_INFINITY };
  const page = statsChanges({ rows, today, query, table });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const changes = page.changes.flatMap((change) => {
    const row = byId.get(change.id);
    return row === undefined ? [] : [rowOf(change, row)];
  });
  const name = `specty-stats-${page.range.from}-${page.range.to}.${format}`;
  if (format === "json") {
    const content = JSON.stringify({ query: page.query, range: page.range, changes }, null, 2);
    return { name, type: "application/json; charset=utf-8", content: `${content}\n` };
  }
  return { name, type: "text/csv; charset=utf-8", content: csvOf(changes, lang) };
}

/** The export's row of a change: the table's figures and what its row says besides. */
function rowOf(change: StatsChange, row: StatsListed): StatsExportRow {
  return {
    id: change.id,
    title: change.title,
    kind: change.kind,
    ...(change.size === undefined ? {} : { size: change.size }),
    ...(row.person === undefined ? {} : { person: row.person }),
    ...(change.agent === undefined ? {} : { agent: change.agent }),
    ...(row.model === undefined ? {} : { model: row.model }),
    created: row.created,
    ...(change.closed === undefined ? {} : { closed: change.closed }),
    tasks: change.tasks,
    ...(change.cycle === undefined ? {} : { cycle: change.cycle }),
    verifications: row.verifications.length,
    failed: change.failed,
    ...(change.cost === undefined ? {} : { cost: change.cost }),
  };
}

const HOUR = 3_600_000;

/** How the CSV in a language separates its cells and its decimals. */
interface CsvDialect {
  readonly separator: string;
  readonly decimal: string;
}

/** Excel with Spanish regional settings expects semicolons and a decimal comma; English, commas. */
const DIALECTS: Readonly<Record<Lang, CsvDialect>> = {
  es: { separator: ";", decimal: "," },
  en: { separator: ",", decimal: "." },
};

/** Each column's cell: dates to the local minute, hours and dollars with two decimals. */
const CELLS: Readonly<Record<StatsExportColumn, (row: StatsExportRow, lang: Lang) => string>> = {
  id: (row) => row.id,
  title: (row) => row.title,
  kind: (row, lang) => statsLaneName(row.kind, lang),
  size: (row) => row.size ?? "",
  person: (row) => row.person ?? "",
  agent: (row) => (row.agent === undefined ? "" : agentName(row.agent)),
  model: (row) => row.model ?? "",
  created: (row) => minuteOf(row.created),
  closed: (row) => (row.closed === undefined ? "" : minuteOf(row.closed)),
  tasks: (row) => String(row.tasks),
  cycle: (row, lang) => (row.cycle === undefined ? "" : twoDecimals(row.cycle / HOUR, lang)),
  verifications: (row) => String(row.verifications),
  failed: (row) => String(row.failed),
  cost: (row, lang) => (row.cost === undefined ? "" : twoDecimals(row.cost, lang)),
};

/** `value` with two decimals and the decimal mark of the CSV in `lang`. */
function twoDecimals(value: number, lang: Lang): string {
  return value.toFixed(2).replace(".", DIALECTS[lang].decimal);
}

/** The CSV: the BOM, the header and a line per change, with the separator of `lang`, in CRLF. */
function csvOf(rows: readonly StatsExportRow[], lang: Lang): string {
  const headers = statsExportHeaders(lang);
  const { separator } = DIALECTS[lang];
  const lines = [
    COLUMNS.map((column) => headers[column]),
    ...rows.map((row) => COLUMNS.map((column) => CELLS[column](row, lang))),
  ];
  const line = (cells: readonly string[]) =>
    `${cells.map((cell) => escaped(cell, separator)).join(separator)}\r\n`;
  return `\uFEFF${lines.map(line).join("")}`;
}

/**
 * A cell as RFC 4180 writes it: between quotes, with its own doubled, when it has the `separator`,
 * a quote or a line break. One that starts as a formula would goes after an apostrophe, so the
 * spreadsheet shows it as text instead of running it.
 */
function escaped(cell: string, separator: string): string {
  const text = /^[=+@\t\r-]/.test(cell) ? `'${cell}` : cell;
  return text.includes(separator) || /["\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/** An agent's name by its tool («Claude Code»); a tool the list does not know goes by its id. */
function agentName(tool: string): string {
  return isAgentTool(tool) ? AGENT_NAMES[tool] : tool;
}

/** An ISO time as its local day and minute, `YYYY-MM-DD HH:MM`: a date to a spreadsheet. */
function minuteOf(iso: string): string {
  const date = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${localDay(date)} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
