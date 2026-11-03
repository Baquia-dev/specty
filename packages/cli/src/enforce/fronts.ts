// SPDX-License-Identifier: Apache-2.0
import {
  analyzeShell,
  type Front,
  findFront,
  frontHeldDenial,
  frontResolvesDenial,
  type GuardContext,
  type GuardDecision,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { holdFront, type LiveHold, liveHolds, releaseConversation } from "../store/front-owners";
import { readMemory } from "../store/memory";
import { conversationOf, type GuardTool } from "./actions";

/** The conversation of an agent's tool before a shell command, in the session it works in. */
interface FrontCall {
  readonly session: Session;
  readonly tool: GuardTool;
  readonly event: Record<string, unknown>;
}

/**
 * A command with `specty front take|free <front>` or `specty new --resolves <id>…` that the guard
 * would let through (ADR 0016): the conversation may not take or free a front that another
 * conversation holds, nor create the change of one of its entries, while that one keeps stepping
 * (`memory.orphanAfterMin`); otherwise it holds the last front it takes, and no other. Only the
 * guard knows the conversation, so it records the owner before the command runs, as with
 * `specty enter`. A front that does not exist is left to the command, which says so.
 */
export async function judgeFronts(
  call: FrontCall,
  command: string,
  decision: GuardDecision,
  ctx: GuardContext,
): Promise<GuardDecision> {
  const { fronts: requests, resolves } = analyzeShell(command);
  const conversation = conversationOf(call.event);
  const asks = requests.length > 0 || resolves.length > 0;
  if (!decision.allow || !asks || conversation === undefined) return decision;
  const { session, tool } = call;
  const now = session.environment.now();
  const { fronts } = await readMemory(session.git, session.config.memory.branch);
  const live = await liveHolds(session.git, now, session.config.memory.orphanAfterMin);
  const others = live.filter((hold) => hold.tool !== tool || hold.conversation !== conversation);
  const taken = takenDenial(fronts, others, resolves, ctx);
  if (taken !== undefined) return taken;
  const asked = requests.flatMap(({ action, name }) => {
    const front = findFront(fronts, name);
    return front === undefined ? [] : [{ action, front: front.name }];
  });
  for (const { action, front } of asked) {
    const owner = others.find((hold) => hold.front === front);
    if (owner !== undefined)
      return {
        allow: false,
        rule: "memory",
        ...frontHeldDenial(owner, action, ctx.lang, ctx.command),
      };
  }
  const took = asked.filter(({ action }) => action === "take").at(-1);
  if (took !== undefined)
    await holdFront(session.git, { front: took.front, tool, conversation, at: now.toISOString() });
  return decision;
}

/**
 * The denial for the first entry `specty new --resolves` names that is in a front another
 * conversation holds (`others`); undefined when none is.
 */
function takenDenial(
  fronts: readonly Front[],
  others: readonly LiveHold[],
  ids: readonly string[],
  ctx: GuardContext,
): GuardDecision | undefined {
  for (const id of ids) {
    const wanted = id.toLowerCase();
    const front = fronts.find(({ items }) => items.some((item) => item.toLowerCase() === wanted));
    const owner = others.find((hold) => hold.front === front?.name);
    if (front !== undefined && owner !== undefined) {
      const entry = front.items.find((item) => item.toLowerCase() === wanted) ?? id;
      return {
        allow: false,
        rule: "memory",
        ...frontResolvesDenial(owner, entry, ctx.lang, ctx.command),
      };
    }
  }
  return undefined;
}

/**
 * The end of the event's conversation (Claude Code's `SessionEnd`, `/clear` included): the fronts
 * it held are free at once, instead of after `memory.orphanAfterMin` minutes.
 */
export async function endConversation(
  session: Session,
  tool: GuardTool,
  event: Record<string, unknown>,
): Promise<void> {
  const conversation = conversationOf(event);
  if (conversation !== undefined) await releaseConversation(session.git, tool, conversation);
}
