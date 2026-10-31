// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

/** The wait command timed out before human action was completed. */
export function waitTimeoutCard(id: string, timeoutSec: number, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(id),
    t(
      `Tiempo de espera agotado (${timeoutSec}s) en ${id}: la persona aún no ha tomado una decisión. El estado del cambio no se ha modificado.`,
      `Wait timed out (${timeoutSec}s) on ${id}: the person has not taken a decision yet. The change's state was not modified.`,
    ),
    t(
      `recuerda a la persona la decisión pendiente, o ejecuta \`${ctx.command} wait\` nuevamente cuando corresponda.`,
      `remind the person of the pending decision, or run \`${ctx.command} wait\` again when appropriate.`,
    ),
  );
}
