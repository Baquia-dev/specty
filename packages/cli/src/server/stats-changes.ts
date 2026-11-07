// SPDX-License-Identifier: Apache-2.0
import type { ServerResponse } from "node:http";
import {
  localDay,
  type StatsChangesPage,
  type StatsListed,
  type StatsQuery,
  statsChanges,
  statsExport,
  statsExportQuery,
  statsQuery,
  statsRow,
  statsTableQuery,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { SAFE } from "./context";
import { summaryOf } from "./finished";
import { type ChangeRecord, plainRecords } from "./records";

/** The table's row of each record, kept while the record is (`archivedRecords` keeps it). */
const LISTED = new WeakMap<ChangeRecord, StatsListed>();

/**
 * `GET /api/stats/changes` (ARCHITECTURE §15): a page of the panel's table of changes, for the
 * cut that `period`, `who` and `kind` ask for, found by `q`, sorted by `sort` and `dir` and cut
 * by `offset` and `limit`, from every change, open or archived, with today as the server's local
 * day. Each change goes with the title and the size of the Inbox's summary. It only reads.
 */
export async function statsChangesPage(
  session: Session,
  params: URLSearchParams,
): Promise<StatsChangesPage> {
  const table = statsTableQuery(
    {
      q: params.get("q"),
      sort: params.get("sort"),
      dir: params.get("dir"),
      offset: params.get("offset"),
      limit: params.get("limit"),
      lang: params.get("lang"),
    },
    session.lang,
  );
  return statsChanges({
    rows: await listedRows(session),
    today: localDay(session.environment.now()),
    query: cutOf(params),
    table,
  });
}

/**
 * `GET /api/stats/export` (ARCHITECTURE §15): every change of the table for the same cut, without
 * a search and in its default order, as the CSV or JSON file that `format` asks for, with the
 * CSV's header in `lang`, sent as a download named by its period. It only reads.
 */
export async function sendStatsExport(
  response: ServerResponse,
  session: Session,
  params: URLSearchParams,
): Promise<void> {
  const file = statsExport({
    rows: await listedRows(session),
    today: localDay(session.environment.now()),
    query: cutOf(params),
    ...statsExportQuery({ format: params.get("format"), lang: params.get("lang") }, session.lang),
  });
  response.writeHead(200, {
    ...SAFE,
    "Content-Type": file.type,
    "Content-Disposition": `attachment; filename="${file.name}"`,
  });
  response.end(file.content);
}

/** The cut the URL asks for: `period`, `who` and `kind`, as `/api/stats` reads them. */
function cutOf(params: URLSearchParams): StatsQuery {
  return statsQuery({
    period: params.get("period"),
    who: params.get("who"),
    kind: params.get("kind"),
  });
}

/** Every change's row, open or archived, with its title and size. */
export async function listedRows(session: Session): Promise<readonly StatsListed[]> {
  return (await plainRecords(session)).flatMap((record) => listedOf(record) ?? []);
}

/** The record's row, with its title and size; none when its audit has no line to date it. */
function listedOf(record: ChangeRecord): StatsListed | undefined {
  const known = LISTED.get(record);
  if (known !== undefined) return known;
  const row = statsRow(record.state, record.audit ?? []);
  if (row === undefined) return undefined;
  const { title, size } = summaryOf(record);
  const listed = { ...row, title, size: size.level };
  LISTED.set(record, listed);
  return listed;
}
