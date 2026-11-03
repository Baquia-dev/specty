// SPDX-License-Identifier: Apache-2.0
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * What sends an agent's turn back (ADR 0016): the pending items its last message lists that are
 * not in Specty's memory, and how to add them, or to say they need no entry. Once per turn.
 */
export function memoryStopReason(items: readonly string[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const add = `\`${ctx.command} memory add "${t("<texto>", "<text>")}"\``;
  return [
    t(
      "Tu último mensaje deja pendientes que no están en la memoria de Specty:",
      "Your last message leaves pending items that are not in Specty's memory:",
    ),
    ...items.map((item) => `- ${item}`),
    t(
      `Anota cada uno con ${add}, escrito para alguien sin esta conversación, y cita su id en tu mensaje; o di que no hace falta anotarlos. Specty no lo volverá a pedir en este turno.`,
      `Add each one with ${add}, written for someone without this conversation, and cite its id in your message; or say they need no entry. Specty will not ask again this turn.`,
    ),
  ].join("\n");
}
