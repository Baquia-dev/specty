// SPDX-License-Identifier: Apache-2.0
import type { Output } from "../output";
import { blockedCard } from "./flow";
import { runNext, translator } from "./text";
import type { CardContext } from "./view";

/** Why `specty adjust` records nothing in the active change. */
export type AdjustRefusal =
  | { readonly reason: "no-request" }
  /** Adjustments are asked for while the result is in acceptance. */
  | { readonly reason: "not-in-acceptance" };

/** A `specty adjust` that records nothing: `invalid` when the request is missing. */
export function adjustRefusalCard(
  refusal: AdjustRefusal,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  switch (refusal.reason) {
    case "no-request":
      return {
        ...blockedCard(
          header,
          t("Falta la petición del usuario.", "The user's request is missing."),
          t(
            `ejecuta \`${ctx.command} adjust "<petición literal>"\`.`,
            `run \`${ctx.command} adjust "<literal request>"\`.`,
          ),
        ),
        status: "invalid",
      };
    case "not-in-acceptance":
      return blockedCard(
        header,
        t(
          "Los ajustes se piden cuando el resultado está en aceptación.",
          "Adjustments are requested while the result is in acceptance.",
        ),
        runNext(ctx),
      );
  }
}
