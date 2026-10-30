// SPDX-License-Identifier: Apache-2.0
import type { Output } from "../output";
import { blockedCard } from "./flow";
import { runNext, translator } from "./text";
import type { CardContext } from "./view";

/** Why `specty adjust` records nothing in the active change. */
export type AdjustRefusal =
  | { readonly reason: "no-request" }
  /** Adjustments are asked for while the result is in acceptance. */
  | { readonly reason: "not-in-acceptance" }
  /** The merge of `target` an acceptance left is still in progress: the agent finishes it first. */
  | { readonly reason: "merging"; readonly target: string };

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
    case "merging":
      return blockedCard(
        header,
        t(
          `El merge de ${refusal.target} sigue en curso en esta carpeta: los ajustes se piden cuando termine.`,
          `The merge of ${refusal.target} is still in progress in this folder: adjustments are requested once it is done.`,
        ),
        t(
          `termina la incorporación con \`${ctx.command} integrate\` (\`${ctx.command} next\` te dice qué falta) y vuelve a ejecutar \`${ctx.command} adjust\`.`,
          `finish the incorporation with \`${ctx.command} integrate\` (\`${ctx.command} next\` says what is missing) and run \`${ctx.command} adjust\` again.`,
        ),
      );
  }
}
