// SPDX-License-Identifier: Apache-2.0
import {
  localDay,
  type StatsQuery,
  type StatsView,
  statsQuery,
  statsRow,
  statsView,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { readMemory } from "../store/memory";
import { plainRecords } from "./records";

/**
 * The panel of `query`'s cut (ARCHITECTURE §15): from every change, open or archived, as their
 * files are (`plainRecords`: a change's row only reads its state and its audit), and the memory's
 * entries, with today as the session's local day. What `GET /api/stats` answers and `specty
 * stats` prints, so both give the same figures. It only reads.
 */
export async function statsOf(session: Session, query: StatsQuery): Promise<StatsView> {
  const rows = (await plainRecords(session)).flatMap(
    (record) => statsRow(record.state, record.audit ?? []) ?? [],
  );
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
