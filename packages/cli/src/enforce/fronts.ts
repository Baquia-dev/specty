// SPDX-License-Identifier: Apache-2.0
import {
  analyzeShell,
  findFront,
  frontHeldDenial,
  type GuardContext,
  type GuardDecision,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { holdFront, liveHolds } from "../store/front-owners";
import { readMemory } from "../store/memory";
import { conversationOf, type GuardTool } from "./actions";

/** The conversation of an agent's tool before a shell command, in the session it works in. */
interface FrontCall {
  readonly session: Session;
  readonly tool: GuardTool;
  readonly event: Record<string, unknown>;
}

/**
 * A command with `specty front take|free <front>` that the guard would let through (ADR 0016):
 * the conversation may not take or free a front that another conversation holds, while that one
 * keeps stepping (`memory.orphanAfterMin`); otherwise it holds the last front it takes, and no
 * other. Only the guard knows the conversation, so it records the owner before the command runs,
 * as with `specty enter`. A front that does not exist is left to the command, which says so.
 */
export async function judgeFronts(
  call: FrontCall,
  command: string,
  decision: GuardDecision,
  ctx: GuardContext,
): Promise<GuardDecision> {
  const requests = analyzeShell(command).fronts;
  const conversation = conversationOf(call.event);
  if (!decision.allow || requests.length === 0 || conversation === undefined) return decision;
  const { session, tool } = call;
  const now = session.environment.now();
  const { fronts } = await readMemory(session.git, session.config.memory.branch);
  const live = await liveHolds(session.git, now, session.config.memory.orphanAfterMin);
  const others = live.filter((hold) => hold.tool !== tool || hold.conversation !== conversation);
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
  const taken = asked.filter(({ action }) => action === "take").at(-1);
  if (taken !== undefined)
    await holdFront(session.git, { front: taken.front, tool, conversation, at: now.toISOString() });
  return decision;
}
