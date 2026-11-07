// SPDX-License-Identifier: Apache-2.0
// The panel's table of changes (docs/ui.md, «Panel», «Cambios»): the changes of the cut that
// lived in the period, each with its own figures, found by title or id as the Inbox finds them,
// sorted by a column and cut into pages. The local server answers it as `GET /api/stats/changes`.
import { LANGS, type Lang } from "../i18n";
import { matchesQuery } from "../listing";
import type { SizeLevel } from "../sizing/size";
import type { ChangeKind } from "../spec/model";
import { inCut, type StatsQuery, type StatsRange, statsRanges } from "./period";
import type { StatsRow } from "./rows";

const SORTS = [
  "closed",
  "title",
  "kind",
  "size",
  "agent",
  "tasks",
  "cycle",
  "failed",
  "cost",
] as const;
/** The columns the table can be sorted by. */
export type StatsChangeSort = (typeof SORTS)[number];
type Direction = "asc" | "desc";

/** A change's row of the panel and what the table shows besides: its title and its size. */
export interface StatsListed extends StatsRow {
  readonly title: string;
  readonly size?: SizeLevel;
}

/** A change as the table shows it: the figures of the whole change, whatever the period. */
export interface StatsChange {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  readonly size?: SizeLevel;
  /** The tool of its agent. */
  readonly agent?: string;
  /** ISO time it closed; none while it is open. */
  readonly closed?: string;
  /** Its tasks completed. */
  readonly tasks: number;
  /** Milliseconds from created to closed; none while it is open. */
  readonly cycle?: number;
  /** Its task verifications that failed. */
  readonly failed: number;
  /** The US dollars measured; none when nothing measured it. */
  readonly cost?: number;
}

/** What the table asks for: a search, a column and its direction, a page, and its language. */
export interface StatsTableQuery {
  readonly q: string;
  readonly sort: StatsChangeSort;
  readonly dir: Direction;
  readonly offset: number;
  readonly limit: number;
  /** The language its texts sort in. */
  readonly lang: Lang;
}

/** A page of the table, as `GET /api/stats/changes` gives it. */
export interface StatsChangesPage {
  /** The cut, as `statsQuery` understood it, and the days of its period. */
  readonly query: StatsQuery;
  readonly range: StatsRange;
  /** The table's values it used: each one understood, or its default. */
  readonly table: StatsTableQuery;
  readonly changes: readonly StatsChange[];
  /** How many changes of the cut lived in the period and match the search. */
  readonly total: number;
}

/** The URL's parameters of the table, each one as it came, or none. */
interface TableParams {
  readonly q?: string | null | undefined;
  readonly sort?: string | null | undefined;
  readonly dir?: string | null | undefined;
  readonly offset?: string | null | undefined;
  readonly limit?: string | null | undefined;
  readonly lang?: string | null | undefined;
}

/** How many changes a page has, and the most it can have. */
const PAGE = 25;
const MOST = 100;

/** The direction each column starts in: texts from A to Z, dates and figures from the most. */
const NATURAL: Readonly<Record<StatsChangeSort, Direction>> = {
  closed: "desc",
  title: "asc",
  kind: "asc",
  size: "desc",
  agent: "asc",
  tasks: "desc",
  cycle: "desc",
  failed: "desc",
  cost: "desc",
};

/**
 * The table that `params` ask for: each value understood, or its default: no search, the last
 * closed first, the first page of 25, and `lang`. Without a direction, the column's own.
 */
export function statsTableQuery(params: TableParams, lang: Lang): StatsTableQuery {
  const sort = SORTS.find((known) => known === params.sort) ?? "closed";
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : NATURAL[sort];
  const limit = whole(params.limit);
  return {
    q: params.q ?? "",
    sort,
    dir,
    offset: whole(params.offset) ?? 0,
    limit: limit !== undefined && limit >= 1 && limit <= MOST ? limit : PAGE,
    lang: LANGS.find((known) => known === params.lang) ?? lang,
  };
}

/** A whole number written as digits; none for anything else. */
function whole(text: string | null | undefined): number | undefined {
  return text !== null && text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined;
}

/** What the table is made of: every change's row, the local today, the cut and the table. */
interface TableInput {
  readonly rows: readonly StatsListed[];
  /** YYYY-MM-DD, local. */
  readonly today: string;
  readonly query: StatsQuery;
  readonly table: StatsTableQuery;
}

/**
 * The page of the table: the changes of the cut whose life, from their first to their last audit
 * line, touches the period (those the panel counts), found by the search, sorted and cut.
 */
export function statsChanges({ rows, today, query, table }: TableInput): StatsChangesPage {
  const first = rows.reduce((day, row) => (row.lived.from < day ? row.lived.from : day), today);
  const { current } = statsRanges(query.period, today, first);
  const found = rows
    .filter(
      (row) => inCut(row, query) && row.lived.from <= current.to && row.lived.to >= current.from,
    )
    .map(changeOf)
    .filter((change) => matchesQuery(change, table.q));
  return {
    query,
    range: current,
    table,
    changes: sorted(found, table).slice(table.offset, table.offset + table.limit),
    total: found.length,
  };
}

/** The table's change of a row: its whole figures. */
function changeOf(row: StatsListed): StatsChange {
  const failed = row.verifications.filter((one) => !one.passed).length;
  const cost =
    row.costs.length === 0 ? undefined : row.costs.reduce((sum, one) => sum + one.cost, 0);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    ...(row.size === undefined ? {} : { size: row.size }),
    ...(row.agent === undefined ? {} : { agent: row.agent }),
    ...(row.closed === undefined
      ? {}
      : { closed: row.closed, cycle: Date.parse(row.closed) - Date.parse(row.created) }),
    tasks: row.tasks.length,
    failed,
    ...(cost === undefined ? {} : { cost }),
  };
}

const SIZES: Readonly<Record<SizeLevel, number>> = { S: 1, M: 2, L: 3, XL: 4 };

/** The lanes in the order of the panel's filter: Feature, Quick, Épica, Spike and Manual. */
const LANES: readonly ChangeKind[] = ["standard", "quick", "epic", "spike", "retro"];

/** Each column's value: a number or a text; none when the change lacks it. */
const VALUES: Readonly<
  Record<StatsChangeSort, (change: StatsChange) => number | string | undefined>
> = {
  closed: (change) => (change.closed === undefined ? undefined : Date.parse(change.closed)),
  title: (change) => change.title,
  kind: (change) => LANES.indexOf(change.kind),
  size: (change) => (change.size === undefined ? undefined : SIZES[change.size]),
  agent: (change) => change.agent,
  tasks: (change) => change.tasks,
  cycle: (change) => change.cycle,
  failed: (change) => change.failed,
  cost: (change) => change.cost,
};

/**
 * `changes` by the table's column and direction, in a new list. The ones that lack its value go
 * last both ways, and ties go by id, the newest first, so every page agrees.
 */
function sorted(changes: readonly StatsChange[], table: StatsTableQuery): readonly StatsChange[] {
  const value = VALUES[table.sort];
  const sign = table.dir === "asc" ? 1 : -1;
  const compare = (a: number | string, b: number | string) =>
    typeof a === "string" && typeof b === "string"
      ? a.localeCompare(b, table.lang, { sensitivity: "base" })
      : Number(a) - Number(b);
  const byId = (one: StatsChange, other: StatsChange) =>
    one.id < other.id ? 1 : one.id > other.id ? -1 : 0;
  return changes.toSorted((one, other) => {
    const a = value(one);
    const b = value(other);
    if (a === undefined || b === undefined)
      return Number(a === undefined) - Number(b === undefined) || byId(one, other);
    return sign * compare(a, b) || byId(one, other);
  });
}
