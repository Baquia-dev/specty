// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { integrationCard } from "./integration";
import { draftingGuide, quoted, translator } from "./text";
import type { CardContext, ChangeView } from "./view";
import { acceptanceCard, adjustingCard, closingCard, implementingCard } from "./work";

export { taskCard } from "./work";

export interface NextView {
  readonly change?: ChangeView;
  /** Governed paths changed in the working tree while no change is active. */
  readonly dirty: readonly string[];
}

/** `specty next`: what to do now, for every phase. Never changes anything. */
export function nextCard(view: NextView, ctx: CardContext): Output {
  const { change } = view;
  if (change === undefined) return noChangeCard(view.dirty, ctx);
  if (change.integration !== undefined) return integrationCard(change, change.integration, ctx);
  switch (change.phase) {
    case "draft":
      return draftCard(change, ctx);
    case "review":
      return reviewCard(change, ctx);
    case "implementing":
      return implementingCard(change, ctx);
    case "acceptance":
      return acceptanceCard(change, ctx);
    case "adjusting":
      return adjustingCard(change, ctx);
    case "closing":
      return closingCard(change, ctx);
    case "done":
    case "cancelled":
      return finishedCard(change, ctx);
  }
}

export function notInitializedCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header: headerOf(),
    blocks: section(undefined, [
      t("Este repositorio no usa Specty todavía.", "This repository does not use Specty yet."),
    ]),
    next: t(
      `si el usuario quiere usarlo, ejecuta \`${ctx.command} init\`.`,
      `if the user wants to use it, run \`${ctx.command} init\`.`,
    ),
  };
}

function noChangeCard(dirty: readonly string[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  if (dirty.length > 0) {
    return {
      status: "blocked",
      header: headerOf(),
      blocks: section(t("CAMBIOS SIN SPEC", "CHANGES WITHOUT A SPEC"), dirty),
      next: t(
        `documéntalos: prepáralos con \`git add\` y ejecuta \`${ctx.command} retro\`.`,
        `document them: stage them with \`git add\` and run \`${ctx.command} retro\`.`,
      ),
    };
  }
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(undefined, [
      t("No hay un cambio activo.", "There is no active change."),
      t(
        "Si el usuario pidió crear o modificar código, primero va la spec.",
        "If the user asked to create or modify code, the spec comes first.",
      ),
      t(
        "Para leer, explicar o investigar código no necesitas Specty.",
        "Reading, explaining or exploring code does not need Specty.",
      ),
    ]),
    next: t(
      `ejecuta \`${ctx.command} new "<título>"\` (añade \`--kind quick\` si son hasta ${ctx.quickMaxFiles} archivos sin rutas sensibles).`,
      `run \`${ctx.command} new "<title>"\` (add \`--kind quick\` for up to ${ctx.quickMaxFiles} files without sensitive paths).`,
    ),
  };
}

function draftCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(change.id, "draft"),
    blocks: [
      ...section(undefined, [
        t(`Spec en borrador: ${change.specPath}`, `Draft spec: ${change.specPath}`),
      ]),
      ...section(t("CÓMO REDACTARLA", "HOW TO WRITE IT"), draftingGuide(change, ctx)),
    ],
    next: t(
      `completa la spec y ejecuta \`${ctx.command} propose\`.`,
      `complete the spec and run \`${ctx.command} propose\`.`,
    ),
  };
}

function reviewCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const header = headerOf(
    change.id,
    "review",
    t(`revisión ${change.revision}`, `revision ${change.revision}`),
  );
  if (change.rejected.length > 0) {
    const lines = change.rejected.map(
      (item) =>
        `${item.id} ${quoted(item.text, ctx.lang)}${item.comment === undefined ? "" : ` — ${item.comment}`}`,
    );
    return {
      status: "ok",
      header,
      blocks: section(t("SUPUESTOS RECHAZADOS", "REJECTED ASSUMPTIONS"), lines),
      next: t(
        `corrige ${change.specPath} y ejecuta \`${ctx.command} propose\`.`,
        `fix ${change.specPath} and run \`${ctx.command} propose\`.`,
      ),
    };
  }
  if (ctx.delegated === true) {
    return {
      status: "ok",
      header,
      blocks: section(undefined, [
        t(
          "Modo delegado: la revisión te toca a ti. No modifiques código.",
          "Delegated mode: the review is yours. Do not modify code.",
        ),
      ]),
      next: t(
        `modo delegado: aprueba tú la spec con \`${ctx.command} approve\` y sigue su salida.`,
        `delegated mode: approve the spec yourself with \`${ctx.command} approve\` and follow its output.`,
      ),
    };
  }
  return {
    status: "ok",
    header,
    blocks: section(undefined, [
      t(
        "Esperando la revisión del usuario. No modifiques código.",
        "Waiting for the user's review. Do not modify code.",
      ),
    ]),
    next: t(
      `pide al usuario que revise la spec y la apruebe con \`${ctx.command} approve\` en su terminal; luego termina tu turno.`,
      `ask the user to review the spec and approve it with \`${ctx.command} approve\` in their terminal; then end your turn.`,
    ),
  };
}

function finishedCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const done = change.phase === "done";
  const branch =
    change.branch === undefined
      ? ""
      : t(`fusiona la rama ${change.branch} y, `, `merge branch ${change.branch} and, `);
  return {
    status: "ok",
    header: headerOf(change.id, change.phase),
    blocks: section(undefined, [
      done
        ? t("El cambio está cerrado.", "The change is closed.")
        : t("El cambio se canceló.", "The change was cancelled."),
    ]),
    next: t(
      `${branch}para otro cambio, ejecuta \`${ctx.command} new "<título>"\`.`,
      `${branch}for another change, run \`${ctx.command} new "<title>"\`.`,
    ),
  };
}
