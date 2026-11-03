// SPDX-License-Identifier: Apache-2.0
import { harvestable, memoryStopReason, pendingInMessage } from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { AgentAdapter, AgentStop } from "../agents/adapter";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { readMemory } from "../store/memory";
import { isGuardTool } from "./actions";

/**
 * `specty hook memory-stop <agent>` (ADR 0016): when the agent ends its turn with a last message
 * that lists pending items not in Specty's memory, it gets the turn back, once, to add them or to
 * say they need no entry. Only for an agent whose end of turn gives its last message; nothing is
 * printed otherwise, or when there is nothing to add.
 */
export async function memoryStop(session: Session, tool: string, input: string): Promise<string> {
  const net = netOf(session, tool);
  if (net === undefined) return "";
  const event = eventOf(net.agent, input);
  if (!net.stop.acts(event)) return "";
  const items = pendingInMessage(net.lastMessage(event) ?? "");
  if (items.length === 0) return "";
  const missing = harvestable(items, await readMemory(session.git, session.config.memory.branch));
  return missing.length === 0 ? "" : net.stop.reply(memoryStopReason(missing, session.cards));
}

/** The agent's end of turn and last message, when it has both and its hooks are its own. */
function netOf(
  session: Session,
  tool: string,
):
  | {
      readonly agent: AgentAdapter;
      readonly stop: AgentStop;
      readonly lastMessage: NonNullable<AgentAdapter["lastMessage"]>;
    }
  | undefined {
  const agent = isGuardTool(tool) ? ADAPTERS[tool] : undefined;
  const { stop, lastMessage } = agent ?? {};
  if (agent === undefined || stop === undefined || lastMessage === undefined) return undefined;
  // Another tool runs these hooks as its own, and its own end of turn answers.
  return agent.borrowed?.(session.environment.env) === true
    ? undefined
    : { agent, stop, lastMessage };
}

/** The end-of-turn event, with the names the hooks read. */
function eventOf(agent: AgentAdapter, input: string): Record<string, unknown> {
  const parsed = parseJson(input);
  const given = isRecord(parsed) ? parsed : {};
  return agent.normalize?.(given) ?? given;
}
