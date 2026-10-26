// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { checkStatus, nothingChangedCard } from "./refusals";
import { translator } from "./text";
import type { CardContext } from "./view";

// Which change a person's decision applies to, from any folder (ARCHITECTURE §9).

/** The decision names a change that no folder has. */
export function noSuchChangeCard(id: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(),
    t(`No hay ningún cambio ${id}.`, `There is no change ${id}.`),
    checkStatus(ctx),
  );
}

/** No change, in any folder, waits for this decision. */
export function nothingWaitsCard(action: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(),
    t(`Ningún cambio espera \`${action}\`.`, `No change waits for \`${action}\`.`),
    checkStatus(ctx),
  );
}

/** What the person is asked when several changes wait for their decision. */
export function whichChangeQuestion(lang: Lang): string {
  return translator(lang)("¿En qué cambio?", "Which change?");
}

/** The note that tells the person their decision applies to a change in another folder. */
export function otherFolderNote(
  change: { readonly id: string; readonly title: string; readonly folder: string },
  lang: Lang,
): { readonly title: string; readonly text: string } {
  const t = translator(lang);
  const { id, title, folder } = change;
  return {
    title: t("Cambio", "Change"),
    text: t(`${id} — ${title}, en ${folder}`, `${id} — ${title}, in ${folder}`),
  };
}

/** A decision the person put off: nothing changed, and `status` brings them back to it. */
export function decisionPostponedCard(id: string, phase: Phase, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return nothingChangedCard(
    headerOf(id, phase),
    t(
      `revisa \`${ctx.command} status\` cuando quieras decidir.`,
      `check \`${ctx.command} status\` when you want to decide.`,
    ),
    ctx,
  );
}
