// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { Output } from "../output";
import { criteriaWarnings } from "./criteria";
import { sliceLines } from "./epic";
import { blockedCard } from "./flow";
import { longFileWarnings } from "./lines";
import { translator } from "./text";
import type { CardContext, ChangeView } from "./view";
import { assertionWarnings, riskWarnings } from "./work";

// The texts of a person's `accept`: what they see before deciding, and what it did.

/**
 * What the person sees before accepting: an epic's slices or each task's summary, the warnings
 * of its tasks, and, when `unverified`, that nothing verifies the whole change.
 */
export function acceptanceSummary(
  change: ChangeView,
  unverified: boolean,
  ctx: CardContext,
): string {
  const t = translator(ctx.lang);
  return [
    ...sliceLines(change.slices ?? [], ctx),
    ...change.tasks.map(
      (task) =>
        `${task.id} ${task.summary ?? task.title}${task.commit === undefined ? "" : ` (${task.commit})`}`,
    ),
    ...criteriaWarnings(change.criteriaTests ?? [], ctx.lang, "person"),
    ...assertionWarnings(change.tasks, ctx.lang),
    ...riskWarnings(change.tasks, ctx.lang),
    ...longFileWarnings(change.tasks, ctx.lang),
    ...(unverified
      ? [
          t(
            "Nada verifica el cambio entero: .specty/config.yaml no tiene `verify.full` ni `verify.default`, así que solo se ejecutó el `verify` de cada tarea.",
            "Nothing verifies the whole change: .specty/config.yaml has neither `verify.full` nor `verify.default`, so only each task's `verify` ran.",
          ),
        ]
      : []),
  ].join("\n");
}

/** The full verification already passed on this same code, in `task` or in an earlier run. */
export function verificationReusedNote(
  command: string,
  task: string | undefined,
  lang: Lang,
): { readonly title: string; readonly text: string } {
  const t = translator(lang);
  return {
    title: t("Verificación completa", "Full verification"),
    text: t(
      `La verificación completa (\`${command}\`) ya pasó con este mismo código ${task === undefined ? "en una verificación anterior" : `en ${task}`}: no se repite.`,
      `The full verification (\`${command}\`) already passed on this same code ${task === undefined ? "in an earlier run" : `in ${task}`}: it does not run again.`,
    ),
  };
}

export function runVerificationQuestion(command: string, lang: Lang): string {
  return translator(lang)(
    `¿Ejecutar antes la verificación completa (\`${command}\`)?`,
    `Run the full verification (\`${command}\`) first?`,
  );
}

/** The title of the note with the end of the full verification's output. */
export function verificationNoteTitle(passed: boolean, lang: Lang): string {
  const t = translator(lang);
  return passed
    ? t("Verificación correcta", "Verification passed")
    : t("Verificación fallida", "Verification failed");
}

/** In delegated mode a failed full verification is never accepted: the agent fixes it first. */
export function delegatedFailureCard(header: string, command: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t(
      `La verificación completa (\`${command}\`) falló: en modo delegado no se acepta.`,
      `The full verification (\`${command}\`) failed: in delegated mode it is not accepted.`,
    ),
    t(
      `corrige el fallo: ejecuta \`${ctx.command} adjust "<qué falla>"\` y sigue su salida.`,
      `fix the failure: run \`${ctx.command} adjust "<what fails>"\` and follow its output.`,
    ),
  );
}

export function acceptAnywayQuestion(lang: Lang): string {
  return translator(lang)("¿Aceptar de todos modos?", "Accept anyway?");
}

export function acceptQuestion(title: string, lang: Lang): string {
  return translator(lang)(
    `¿Aceptar el resultado de «${title}»?`,
    `Accept the result of "${title}"?`,
  );
}

/** A standard change accepted: its closing comes next, from the agent. */
export function acceptedLine(lang: Lang): string {
  return translator(lang)(
    "Resultado aceptado; el agente redactará el cierre.",
    "Result accepted; the agent will write the closing.",
  );
}

/** The closing of a quick change, written by Specty: the summary of its task. */
export function quickClosing(summaries: readonly string[], lang: Lang): string {
  return `### ${translator(lang)("Resumen", "Summary")}\n\n${summaries.join("\n")}`;
}

export function quickClosedLine(commit: string, lang: Lang): string {
  return translator(lang)(
    `Cambio aceptado, cerrado y archivado (commit ${commit}).`,
    `Change accepted, closed and archived (commit ${commit}).`,
  );
}
