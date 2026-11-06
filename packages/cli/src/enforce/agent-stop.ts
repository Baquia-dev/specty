// SPDX-License-Identifier: Apache-2.0
import { checkChangedFailedLine, noWaitLine, renderText } from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import { type AgentStop, NO_CHECK } from "../agents/adapter";
import { check } from "../commands/check";
import { next } from "../commands/next";
import { isWaitingForHuman } from "../commands/wait";
import { resolveActive } from "../flow/active";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { readWait } from "../store/waits";
import { conversationOf, type GuardTool, isGuardTool, subagentOf } from "./actions";
import { leavePending, takePending } from "./pending";
import { enteredSession } from "./sessions";

/**
 * `specty hook agent-stop <agent>` (ADR 0012): when the agent ends its turn, `specty check
 * --changed` runs, with the plan's checks while a change is approved; if it fails, the agent gets
 * the report back and goes on, in the form its documentation gives, which its module knows
 * (`agents/`). Before that, while the change waits for the person and no `specty wait` waits for
 * it, the agent gets the card of `next` back instead. With `--no-check`, as `init` installs it,
 * only that rule acts: the check runs where `check --install` took the mark away. Nothing is
 * printed when there is nothing to fix, or for an agent without one.
 */

/** The phases whose change has an approved plan the diff must keep to. */
const APPROVED_PHASES: ReadonlySet<string> = new Set([
  "testing",
  "implementing",
  "adjusting",
  "acceptance",
  "closing",
]);

/**
 * What to print for the agent: its reply, or what lets the turn end (nothing, for most). `flags`
 * are the hook's arguments after the agent.
 */
export async function agentStop(
  session: Session,
  tool: string,
  input: string,
  flags: readonly string[],
): Promise<string> {
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
  const checks = !flags.includes(NO_CHECK);
  const report = stop.acts(event)
    ? await turnReport(there, stop, event, agent.tool, checks)
    : undefined;
  return report === undefined ? (stop.pass ?? "") : stop.reply(report);
}

/**
 * What sends the turn back: the rule of `wait`, and then, with `checks`, `specty check --changed`
 * failing, with the plan's checks while a change is approved. For a tool that does not mark a
 * turn it sent back, Specty keeps the count by conversation: the end that follows goes through,
 * as `stop_hook_active` lets Claude Code's.
 */
async function turnReport(
  session: Session,
  stop: AgentStop,
  event: Record<string, unknown>,
  tool: GuardTool,
  checks: boolean,
): Promise<string | undefined> {
  const conversation = stop.counts === true ? conversationOf(event) : undefined;
  if (
    conversation !== undefined &&
    (await takePending(session, conversation, "stop")) !== undefined
  ) {
    return undefined;
  }
  const active = await resolveActive(session);
  const report =
    (await waitReport(session, active, event, tool)) ??
    (checks ? await checkReport(session, active) : undefined);
  if (report !== undefined && conversation !== undefined) {
    await leavePending(session, conversation, "stop");
  }
  return report;
}

/**
 * The rule of `wait`: the change waits for the person and no `specty wait` of it is alive, so the
 * agent gets the card of `next` back, which says how to wait in its tool or, delegated, to decide.
 * Never for a subagent, which hands its turn back to the main conversation. A `wait` started in
 * the background just before the turn ended may have no mark yet: the line says it may end then.
 */
async function waitReport(
  session: Session,
  active: StoredChange | undefined,
  event: Record<string, unknown>,
  tool: GuardTool,
): Promise<string | undefined> {
  if (active === undefined || subagentOf(event) !== undefined) return undefined;
  if (!isWaitingForHuman(active)) return undefined;
  const { id } = active.state;
  // The mark's times are the real clock's (`store/waits.ts`).
  const seen = await readWait(session.git, id, new Date());
  if (seen !== undefined && seen.ended === undefined) return undefined;
  // The hook's agent, though its environment may not say so: the card says how it waits.
  const ours: Session = { ...session, tool, cards: { ...session.cards, tool } };
  return `${noWaitLine(id, ours.cards)}\n${renderText(await next(ours), ours.lang)}`;
}

/** `specty check --changed` failing, with the plan's checks while a change is approved. */
async function checkReport(
  session: Session,
  active: StoredChange | undefined,
): Promise<string | undefined> {
  const planned = active !== undefined && APPROVED_PHASES.has(active.state.phase);
  const result = await check(
    session,
    "changed",
    false,
    planned ? { id: active.state.id } : undefined,
  );
  if (result.code === 0) return undefined;
  return `${checkChangedFailedLine(session.lang)}\n${result.report}`;
}
