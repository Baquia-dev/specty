// SPDX-License-Identifier: Apache-2.0
import {
  localDay,
  type StatsChangesPage,
  type StatsListed,
  statsChanges,
  statsQuery,
  statsRow,
  statsTableQuery,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
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
  const rows = (await plainRecords(session)).flatMap((record) => listedOf(record) ?? []);
  const query = statsQuery({
    period: params.get("period"),
    who: params.get("who"),
    kind: params.get("kind"),
  });
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
  return statsChanges({ rows, today: localDay(session.environment.now()), query, table });
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
