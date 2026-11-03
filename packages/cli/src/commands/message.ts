// SPDX-License-Identifier: Apache-2.0
import {
  type MessageView,
  messageLeftCard,
  messageRefusalCard,
  type Output,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { isFinished, resolveActive } from "../flow/active";
import { locateChanges } from "../flow/changes";
import type { Session } from "../session";
import { leaveMessage } from "../store/messages";

type Run = (handler: (session: Session) => Promise<Output>) => () => Promise<void>;

/** Registers `specty message <id> <text>`, without a lock: it writes no change's state. */
export function messageCommand(program: Command, run: Run): void {
  program
    .command("message")
    .description("leave a message for the session working on an open change")
    .argument("<id>")
    .argument("<text>")
    .action((id: string, text: string) => run((session) => message(session, id, text))());
}

/**
 * `specty message` (ADR 0016): the agent or the person leaves a message for the session of the
 * open change `id`, in any folder; that session gets it after its next shell command.
 */
async function message(session: Session, id: string, text: string): Promise<Output> {
  const written = text.trim();
  if (written.length === 0) return messageRefusalCard({ reason: "empty", id }, session.cards);
  const located = await locateChanges(session);
  const open = located.some(({ change }) => change.state.id === id && !isFinished(change.state));
  if (!open) return messageRefusalCard({ reason: "no-change", id }, session.cards);
  const at = session.environment.now().toISOString();
  await leaveMessage(session.git, id, { at, text: written, from: await senderOf(session) });
  return messageLeftCard(id, written, session.cards);
}

/** Who leaves a message: the person or the agent, its tool, and its folder and open change. */
async function senderOf(session: Session): Promise<MessageView["from"]> {
  const own = await resolveActive(session);
  const agent = session.actor === "agent";
  return {
    actor: agent ? "agent" : "human",
    ...(agent && session.tool !== undefined ? { tool: session.tool } : {}),
    ...(own !== undefined && !isFinished(own.state) ? { change: own.state.id } : {}),
    folder: session.root,
  };
}
