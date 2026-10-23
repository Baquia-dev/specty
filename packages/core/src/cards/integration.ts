// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext, ChangeView, IntegrationView } from "./view";

/** How many of the files the agent may touch the card lists. */
const LISTED_PATHS = 20;

/**
 * `specty next` while bringing the main branch into the change waits for the agent: the merge is
 * in progress in this folder, with conflicts or with a failing verification (ARCHITECTURE §9).
 */
export function integrationCard(
  change: ChangeView,
  integration: IntegrationView,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const { target, paths } = integration;
  const conflicts = integration.reason === "conflicts";
  const rest = paths.length - LISTED_PATHS;
  return {
    status: "ok",
    header: headerOf(change.id, change.phase, t(`incorporando ${target}`, `merging ${target}`)),
    blocks: [
      ...section(undefined, [
        conflicts
          ? t(
              `Incorporar ${target} a este cambio dio conflictos; el merge espera en esta carpeta.`,
              `Bringing ${target} into this change hit conflicts; the merge waits in this folder.`,
            )
          : t(
              `Con ${target} incorporado, la verificación falla; el merge espera en esta carpeta.`,
              `With ${target} merged in, the verification fails; the merge waits in this folder.`,
            ),
      ]),
      ...section(t("CONFLICTOS", "CONFLICTS"), integration.conflicts),
      ...section(t("PUEDES TOCAR", "YOU MAY TOUCH"), [
        ...paths.slice(0, LISTED_PATHS),
        ...(rest > 0 ? [t(`y ${rest} más`, `and ${rest} more`)] : []),
      ]),
    ],
    next: conflicts
      ? t(
          `resuelve los conflictos sin dejar marcadores (\`<<<<<<<\`) y ejecuta \`${ctx.command} integrate\`.`,
          `resolve the conflicts without leaving markers (\`<<<<<<<\`) and run \`${ctx.command} integrate\`.`,
        )
      : t(
          `arregla lo que falla y ejecuta \`${ctx.command} integrate\`.`,
          `fix what fails and run \`${ctx.command} integrate\`.`,
        ),
  };
}
