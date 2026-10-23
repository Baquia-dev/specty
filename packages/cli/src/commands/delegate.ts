// SPDX-License-Identifier: Apache-2.0
import {
  delegationCard,
  delegationWarning,
  notInteractiveCard,
  type Output,
  translator,
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
  const t = translator(session.lang);
  terminal.note(t("Modo delegado", "Delegated mode"), delegationWarning(session.cards).join("\n"));
  // The first option is the default one: turning it on takes an explicit choice.
  const answer = await terminal.choose(t("¿Activar el modo delegado?", "Turn delegated mode on?"), [
    { value: "no", label: t("No, sigo decidiendo yo", "No, I keep deciding") },
    { value: "yes", label: t("Sí, que decida mi agente", "Yes, let my agent decide") },
  ]);
  if (answer !== "yes") return delegationCard(false, session.cards);
  await writeDelegation(session.git, {
    by: (await session.git.config("user.name")) ?? "unknown",
    at: session.environment.now().toISOString(),
  });
  return delegationCard(true, session.cards);
}
