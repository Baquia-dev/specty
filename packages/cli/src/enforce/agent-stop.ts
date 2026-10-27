// SPDX-License-Identifier: Apache-2.0
import { checkChangedFailedLine } from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { AgentStop } from "../agents/adapter";
import { check } from "../commands/check";
import { resolveActive } from "../flow/active";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { conversationOf, isGuardTool } from "./actions";
import { leavePending, takePending } from "./pending";
import { enteredSession } from "./sessions";

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

/** What to print for the agent: its reply, or what lets the turn end (nothing, for most). */
export async function agentStop(session: Session, tool: string, input: string): Promise<string> {
  const agent = isGuardTool(tool) ? ADAPTERS[tool] : undefined;
  const stop = agent?.stop;
  if (agent === undefined || stop === undefined) return "";
  // Another tool runs these hooks as its own, and its own end of turn answers.
  if (agent.borrowed?.(session.environment.env) === true) return "";
  const parsed = parseJson(input);
  const given = isRecord(parsed) ? parsed : {};
  const event = agent.normalize?.(given) ?? given;
  // A conversation that entered a change's folder ends its turn there.
  const there = (await enteredSession(agent.tool, session, event)).session;
  const report = stop.acts(event) ? await turnReport(there, stop, event) : undefined;
  return report === undefined ? (stop.pass ?? "") : stop.reply(report);
}

/**
 * What sends the turn back: `specty check --changed` failing, with the plan's checks while a
 * change is approved. For a tool that does not mark a turn it sent back, Specty keeps the count
 * by conversation: the end that follows goes through, as `stop_hook_active` lets Claude Code's.
 */
async function turnReport(
  session: Session,
  stop: AgentStop,
  event: Record<string, unknown>,
): Promise<string | undefined> {
  const conversation = stop.counts === true ? conversationOf(event) : undefined;
  if (
    conversation !== undefined &&
    (await takePending(session, conversation, "stop")) !== undefined
  ) {
    return undefined;
  }
  const active = await resolveActive(session);
  const planned = active !== undefined && APPROVED_PHASES.has(active.state.phase);
  const result = await check(
    session,
    "changed",
    false,
    planned ? { id: active.state.id } : undefined,
  );
  if (result.code === 0) return undefined;
  if (conversation !== undefined) await leavePending(session, conversation, "stop");
  return `${checkChangedFailedLine(session.lang)}\n${result.report}`;
}
