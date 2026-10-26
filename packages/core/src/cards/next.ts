// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { integrationCard } from "./integration";
import { draftingGuide, quoted, translator } from "./text";
import type { CardContext, CarriedView, ChangeView, CommentView } from "./view";
import { acceptanceCard, adjustingCard, closingCard, implementingCard } from "./work";

export { taskCard } from "./work";

export interface NextView {
  readonly change?: ChangeView;
  /** Governed paths changed in the working tree while no change is active. */
  readonly dirty: readonly string[];
  /** A new project: no stack and no governed code yet, so the first change is its skeleton. */
  readonly fresh?: boolean;
}

/** `specty next`: what to do now, for every phase. Never changes anything. */
export function nextCard(view: NextView, ctx: CardContext): Output {
  const { change } = view;
  if (change === undefined) return noChangeCard(view.dirty, ctx, view.fresh === true);
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
      `si el usuario quiere usarlo, ejecuta \`${ctx.command} init --language <es|en>\` con el idioma en que te habla.`,
      `if the user wants to use it, run \`${ctx.command} init --language <es|en>\` with the language they speak to you in.`,
    ),
  };
}

function noChangeCard(dirty: readonly string[], ctx: CardContext, fresh: boolean): Output {
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
  // ARCHITECTURE §14: the skeleton is the first change, standard, so the scaffolding is traced.
  if (fresh) {
    return {
      status: "ok",
      header: headerOf(),
      blocks: section(undefined, [
        t(
          "No hay un cambio activo, y es un proyecto nuevo: aún no hay código.",
          "There is no active change, and this is a new project: there is no code yet.",
        ),
        t(
          "El primer cambio es el esqueleto del proyecto, a partir de PRODUCT.md; si tiene preguntas sin responder, házselas antes al usuario.",
          "The first change is the project's skeleton, from PRODUCT.md; if it has unanswered questions, ask the user first.",
        ),
      ]),
      next: t(
        `ejecuta \`${ctx.command} new "Esqueleto del proyecto" --request "<petición literal del usuario>"\`.`,
        `run \`${ctx.command} new "Project skeleton" --request "<the user's literal request>"\`.`,
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
      `ejecuta \`${ctx.command} new "<título>" --request "<petición literal del usuario>"\` (añade \`--kind quick\` si son hasta ${ctx.quickMaxFiles} archivos de código sin rutas sensibles).`,
      `run \`${ctx.command} new "<title>" --request "<the user's literal request>"\` (add \`--kind quick\` for up to ${ctx.quickMaxFiles} code files without sensitive paths).`,
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
      // Verbatim, so the spec answers what the user asked rather than the agent's paraphrase.
      ...section(
        t("PETICIÓN DEL USUARIO", "THE USER'S REQUEST"),
        change.request === undefined ? [] : change.request.split("\n"),
      ),
      ...(change.carried ?? []).flatMap((carried) =>
        section(
          t(`DEL CAMBIO ${carried.id}`, `FROM CHANGE ${carried.id}`),
          carriedLines(carried, ctx),
        ),
      ),
      ...section(t("CÓMO REDACTARLA", "HOW TO WRITE IT"), draftingGuide(change, ctx)),
    ],
    next: t(
      `completa la spec y ejecuta \`${ctx.command} propose\`.`,
      `complete the spec and run \`${ctx.command} propose\`.`,
    ),
  };
}

/** The follow-ups and findings a followed change left, for this spec to take or leave out. */
function carriedLines(carried: CarriedView, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  if (!carried.found) {
    return [
      t(
        "No está en esta carpeta: si sigue abierto, vive en otra worktree.",
        "It is not in this folder: if it is still open, it lives in another worktree.",
      ),
    ];
  }
  const lines = [
    ...carried.pending.map((item) => t(`Pendiente: ${item}`, `Follow-up: ${item}`)),
    ...carried.findings.map(({ task, text }) =>
      t(`Hallazgo de ${task}: ${text}`, `Finding of ${task}: ${text}`),
    ),
  ];
  if (lines.length === 0) return [t("Sin pendientes ni hallazgos.", "No follow-ups or findings.")];
  return [
    ...lines,
    t(
      "Decide qué entra en esta spec; lo demás va a «Fuera de alcance».",
      'Decide what goes into this spec; the rest goes to "Out of scope".',
    ),
  ];
}

/** The spec's sections by the keys comments use (formats.md §5), as the agent reads them. */
const SECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  goal: ["Objetivo", "Goal"],
  outOfScope: ["Fuera de alcance", "Out of scope"],
  assumptions: ["Supuestos", "Assumptions"],
  criteria: ["Criterios de aceptación", "Acceptance criteria"],
  design: ["Diseño", "Design"],
  files: ["Archivos", "Files"],
  tasks: ["Tareas", "Tasks"],
  risks: ["Riesgos", "Risks"],
};

/** Where a comment points: its item, or the section and the quote. */
function anchorOf({ anchor }: CommentView, ctx: CardContext): string {
  if ("item" in anchor) return anchor.item;
  const [es, en] = SECTIONS[anchor.section] ?? [anchor.section, anchor.section];
  return `${ctx.lang === "es" ? es : en} ${quoted(anchor.quote, ctx.lang)}`;
}

function reviewCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const header = headerOf(
    change.id,
    "review",
    t(`revisión ${change.revision}`, `revision ${change.revision}`),
  );
  const requested = change.requested ?? [];
  if (change.rejected.length > 0 || requested.length > 0) {
    const rejected = change.rejected.map(
      (item) =>
        `${item.id} ${quoted(item.text, ctx.lang)}${item.comment === undefined ? "" : ` — ${item.comment}`}`,
    );
    const comments = requested.map(
      (comment) => `${comment.id} · ${anchorOf(comment, ctx)}: ${comment.body}`,
    );
    return {
      status: "ok",
      header,
      blocks: [
        ...section(t("SUPUESTOS RECHAZADOS", "REJECTED ASSUMPTIONS"), rejected),
        ...section(t("CAMBIOS PEDIDOS", "CHANGES REQUESTED"), comments),
      ],
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
