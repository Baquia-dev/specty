// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { Output } from "../output";
import { blockedCard } from "./flow";
import { reloadNext } from "./refusals";
import { translator } from "./text";
import type { CardContext } from "./view";

// The person's review of a spec in the UI: an assumption at a time, comments, and asking the
// agent for the changes (formats.md §5).

export function noAssumptionCard(item: string, header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t(`La spec no tiene el supuesto ${item}.`, `The spec has no assumption ${item}.`),
    reloadNext("review", ctx),
  );
}

export function assumptionDecidedLine(
  item: string,
  decision: "confirmed" | "rejected",
  lang: Lang,
): string {
  const t = translator(lang);
  return decision === "confirmed"
    ? t(`${item} confirmado.`, `${item} confirmed.`)
    : t(
        `${item} rechazado: el agente debe corregir la spec.`,
        `${item} rejected: the agent must fix the spec.`,
      );
}

export function emptyCommentCard(header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t("El comentario está vacío.", "The comment is empty."),
    t("escribe qué debe cambiar.", "write what should change."),
  );
}

export function commentSavedLine(id: string, lang: Lang): string {
  return translator(lang)(
    `Comentario ${id} guardado; cuando termines, pide los cambios.`,
    `Comment ${id} saved; when you are done, ask for the changes.`,
  );
}

/** Asking for changes with no open comment and no rejected assumption. */
export function nothingToRequestCard(header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t(
      "No hay comentarios sin resolver ni supuestos rechazados que pedir.",
      "There are no unresolved comments or rejected assumptions to ask for.",
    ),
    t(
      "comenta lo que debe cambiar, o aprueba la spec.",
      "comment on what should change, or approve the spec.",
    ),
  );
}

/** The comments and rejected assumptions the agent now gets, by id. */
export function changesRequestedLine(ids: readonly string[], lang: Lang): string {
  return translator(lang)(
    `Cambios pedidos al agente: ${ids.join(", ")}.`,
    `Changes asked of the agent: ${ids.join(", ")}.`,
  );
}
