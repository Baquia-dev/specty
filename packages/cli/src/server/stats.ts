// SPDX-License-Identifier: Apache-2.0
import {
  localDay,
  type StatsQuery,
  type StatsView,
  statsQuery,
  statsView,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { readMemory } from "../store/memory";
import { listedRows } from "./stats-changes";

/**
 * The panel of `query`'s cut (ARCHITECTURE §15): from every change, open or archived, with the
 * title of its spec (`listedRows`, the rows of the table of changes, kept with each record), and
 * the memory's entries, with today as the session's local day. What `GET /api/stats` answers and
 * `specty stats` prints, so both give the same figures. It only reads.
 */
export async function statsOf(session: Session, query: StatsQuery): Promise<StatsView> {
  const rows = await listedRows(session);
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  return statsView({ rows, memory: entries, today: localDay(session.environment.now()), query });
}

/**
 * `GET /api/stats` (ARCHITECTURE §15): the panel of the cut that `period`, `who` and `kind` ask
 * for; what it does not understand takes its default (`statsQuery`).
 */
export async function statsAnswer(session: Session, params: URLSearchParams): Promise<StatsView> {
  const query = statsQuery({
    period: params.get("period"),
    who: params.get("who"),
    kind: params.get("kind"),
  });
  return statsOf(session, query);
}
