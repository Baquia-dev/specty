// SPDX-License-Identifier: Apache-2.0
import {
  delegationCard,
  delegationChoices,
  delegationNoteTitle,
  delegationQuestion,
  delegationWarning,
  notInteractiveCard,
  type Output,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { clearDelegation, readDelegation, writeDelegation } from "../store/local";

/**
 * `specty delegate on|off`: the person lets their agent take their decisions, or takes them back
 * (ADR 0010). Both ways need a real TTY: no delegation opens this command.
 */
export async function delegate(session: Session, mode: "on" | "off"): Promise<Output> {
  const { terminal } = session.environment;
  if (!terminal.interactive) return notInteractiveCard(`delegate ${mode}`, session.cards);
  if (mode === "off") {
    await clearDelegation(session.git);
    return delegationCard(false, session.cards);
  }
  if ((await readDelegation(session.git)) !== undefined) return delegationCard(true, session.cards);
  terminal.note(delegationNoteTitle(session.lang), delegationWarning(session.cards).join("\n"));
  // The first option is the default one: turning it on takes an explicit choice.
  const answer = await terminal.choose(
    delegationQuestion(session.lang),
    delegationChoices(session.lang),
  );
  if (answer !== "yes") return delegationCard(false, session.cards);
  await writeDelegation(session.git, {
    by: (await session.git.config("user.name")) ?? "unknown",
    at: session.environment.now().toISOString(),
  });
  return delegationCard(true, session.cards);
}
