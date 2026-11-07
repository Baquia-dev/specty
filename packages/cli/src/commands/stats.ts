// SPDX-License-Identifier: Apache-2.0
import {
  type Output,
  renderText,
  type StatsQuery,
  type StatsRefusal,
  statsCard,
  statsQuery,
  statsRefusalCard,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { statsOf } from "../server/stats";
import type { Session } from "../session";

/** The cut `specty stats` is asked for, each option as it came. */
interface StatsFlags {
  readonly period?: string;
  readonly who?: string;
  readonly kind?: string;
}

/**
 * `specty stats [--period <periodo>] [--who <quién>] [--kind <carril>]` (ARCHITECTURE §6): the
 * panel of `specty ui` in the terminal, for that cut, read as `GET /api/stats` reads it
 * (`statsOf`); with `--json`, that very answer. It only reads, so the agent may run it too.
 */
async function stats(session: Session, flags: StatsFlags): Promise<Output | ReportOutput> {
  const query = statsQuery(flags);
  const refusal = refusalOf(flags, query);
  if (refusal !== undefined) return statsRefusalCard(refusal, session.cards);
  const view = await statsOf(session, query);
  return { report: renderText(statsCard(view, session.cards), session.lang), json: view, code: 0 };
}

/**
 * The first option `statsQuery` did not understand, which the server would take as its default:
 * here it is refused, so no one reads another cut's summary without noticing.
 */
function refusalOf(flags: StatsFlags, query: StatsQuery): StatsRefusal | undefined {
  if (flags.period !== undefined && flags.period !== query.period)
    return { reason: "period", value: flags.period };
  if (flags.who !== undefined && query.who === undefined)
    return { reason: "who", value: flags.who };
  if (flags.kind !== undefined && query.kind === undefined)
    return { reason: "kind", value: flags.kind };
  return undefined;
}

/** Registers `specty stats`; `run` opens the session as for every command. */
export function statsCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>,
): void {
  program
    .command("stats")
    .description("the panel of `specty ui` in the terminal: a period's figures and who did them")
    .option("--period <period>", "7d, 30d, 90d or all (default: 30d)")
    .option("--who <who>", "person:<name>, agent:<tool> or model:<model>")
    .option("--kind <lane>", "only the changes of a lane: quick, standard, spike, retro or epic")
    .action((options: StatsFlags) => run((session) => stats(session, options))());
}
