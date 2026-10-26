// SPDX-License-Identifier: Apache-2.0
import { checkChangedFailedLine } from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import { check } from "../commands/check";
import { resolveActive } from "../flow/active";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { isGuardTool } from "./actions";

/**
 * `specty hook agent-stop <agent>` (ADR 0012): when the agent ends its turn, `specty check
 * --changed` runs, with the plan's checks while a change is approved; if it fails, the agent gets
 * the report back and goes on, in the form its documentation gives, which its module knows
 * (`agents/`). Nothing is printed when there is nothing to fix, or for an agent without one.
 */

/** The phases whose change has an approved plan the diff must keep to. */
const APPROVED_PHASES: ReadonlySet<string> = new Set([
  "implementing",
  "adjusting",
  "acceptance",
  "closing",
]);

/** What to print for the agent: its reply, or nothing to let the turn end. */
export async function agentStop(session: Session, tool: string, input: string): Promise<string> {
  const stop = isGuardTool(tool) ? ADAPTERS[tool].stop : undefined;
  const event = parseJson(input);
  if (stop === undefined || !stop.acts(isRecord(event) ? event : {})) return "";
  const active = await resolveActive(session);
  const planned = active !== undefined && APPROVED_PHASES.has(active.state.phase);
  const result = await check(
    session,
    "changed",
    false,
    planned ? { id: active.state.id } : undefined,
  );
  if (result.code === 0) return "";
  return stop.reply(`${checkChangedFailedLine(session.lang)}\n${result.report}`);
}
