// SPDX-License-Identifier: Apache-2.0
import { closingInAcceptance } from "../flow/phases";
import { counted, type Lang } from "../i18n";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { riskLabel } from "../scope/risk";
import { coverageLines } from "./coverage";
import { criteriaTestLines, criteriaWarnings } from "./criteria";
import { sliceLines } from "./epic";
import { glossaryClosingLines } from "./glossary";
import { longFileWarnings, splitAdvice } from "./lines";
import { reviewRemarkLines } from "./review-remarks";
import { translator } from "./text";
import type { CardContext, ChangeView, TaskView } from "./view";
import { waitStep } from "./wait";

// The acceptance card, and the lines it shares with the task cards and the closing card.

/** A done task: its summary, or its title, and its commit. */
export function doneLine(task: TaskView): string {
  return `${task.id} ${task.summary ?? task.title}${task.commit === undefined ? "" : ` (${task.commit})`}`;
}

/** One line per test that a task removed assertions from: for the agent's card and the person. */
export function assertionWarnings(tasks: readonly TaskView[], lang: Lang): string[] {
  const t = translator(lang);
  return tasks.flatMap((task) =>
    (task.removedAssertions ?? []).map((loss) =>
      t(
        `${task.id} quitó ${counted(loss.removed, "aserción", "aserciones")} de ${loss.path}, un test que ya existía.`,
        `${task.id} removed ${counted(loss.removed, "assertion", "assertions")} from ${loss.path}, a test that already existed.`,
      ),
    ),
  );
}

/** One line per risky finding of a task's diff: for the agent's card and the person. */
export function riskWarnings(tasks: readonly TaskView[], lang: Lang): string[] {
  return tasks.flatMap((task) =>
    (task.risks ?? []).map(
      (risk) =>
        `${task.id}: ${risk.path}${risk.line === undefined ? "" : `:${risk.line}`} ${riskLabel(risk.rule, lang, risk.label)}${risk.cwe === undefined ? "" : ` (${risk.cwe})`}.`,
    ),
  );
}

/** What the done tasks learned (`task done --finding`), one line each. */
export function findingLines(tasks: readonly TaskView[]): string[] {
  return tasks.flatMap((task) => (task.findings ?? []).map((text) => `${task.id}: ${text}`));
}

/**
 * How to write the closing: its sections, the findings of the tasks and the remarks of the review
 * of the result. The closing card says it, and in delegated mode the acceptance card too, where
 * the agent writes the closing before accepting (`closingAhead`).
 */
export function closingGuide(change: ChangeView, ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  const headings =
    change.kind === "spike"
      ? t("### Hallazgos y ### Decisión", "### Findings and ### Decision")
      : t(
          "### Resumen, ### Desviaciones (respecto al plan), ### Decisiones y ### Pendientes",
          "### Summary, ### Deviations (from the plan), ### Decisions and ### Follow-ups",
        );
  const findings = findingLines(change.tasks);
  const carry = t(
    "Lleva a ### Pendientes los que sigan abiertos: un cambio que siga a este con `--follows` los verá.",
    "Carry the open ones to ### Follow-ups: a change that follows this one with `--follows` will see them.",
  );
  return [
    ...section(t("CÓMO CERRAR", "HOW TO CLOSE"), [
      t(
        `Añade al final de ${change.specPath} la sección «## Cierre» con ${headings}.`,
        `Add a "## Closing" section at the end of ${change.specPath} with ${headings}.`,
      ),
      t("No cambies nada más de la spec.", "Do not change anything else in the spec."),
      ...glossaryClosingLines(change.glossary, ctx.lang),
    ]),
    ...section(
      t("HALLAZGOS DE LAS TAREAS", "FINDINGS OF THE TASKS"),
      findings.length === 0 ? [] : [...findings, carry],
    ),
    ...section(
      t("OBSERVACIONES DE LA REVISIÓN", "REVIEW REMARKS"),
      reviewRemarkLines(change.reviewRemarks ?? [], ctx.lang),
    ),
  ];
}

export function acceptanceCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  // In delegated mode the closing comes first, until it is sent.
  const ahead = closingAhead(change, ctx) && !change.closingSubmitted;
  return {
    status: "ok",
    header: headerOf(change.id, "acceptance"),
    blocks: [
      ...section(t("CORTES", "SLICES"), sliceLines(change.slices ?? [], ctx)),
      ...section(t("TAREAS HECHAS", "DONE TASKS"), change.tasks.map(doneLine)),
      ...section(
        t("CRITERIOS Y TESTS", "CRITERIA AND TESTS"),
        criteriaTestLines(change.criteriaTests ?? [], ctx.lang),
      ),
      ...section(
        t("TESTS DESBLOQUEADOS", "UNLOCKED TESTS"),
        (change.unlockedTests ?? []).map(
          ({ path, request, task }) => `${path} (${request}, ${task})`,
        ),
      ),
      ...section(
        t("COBERTURA", "COVERAGE"),
        change.coverage === undefined ? [] : coverageLines(change.coverage, ctx.lang),
      ),
      ...section(t("AVISOS", "WARNINGS"), acceptanceWarnings(change, ctx)),
      ...(ahead ? closingGuide(change, ctx) : []),
    ],
    next: acceptanceNext(change, ctx),
  };
}

/** What the person should know before accepting, each kind with what to do about it. */
function acceptanceWarnings(change: ChangeView, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  const assertions = assertionWarnings(change.tasks, ctx.lang);
  const risks = riskWarnings(change.tasks, ctx.lang);
  const long = longFileWarnings(change.tasks, ctx.lang);
  return [
    ...assertions,
    ...(assertions.length === 0
      ? []
      : [
          t(
            "Cuéntaselo al usuario antes de que acepte: un test debilitado puede ocultar un fallo.",
            "Tell the user before they accept: a weakened test can hide a defect.",
          ),
        ]),
    ...risks,
    ...(risks.length === 0
      ? []
      : [
          t(
            "Revísalo con el usuario antes de que acepte: son patrones de riesgo conocidos, no fallos seguros.",
            "Review them with the user before they accept: they are known risky patterns, not sure defects.",
          ),
        ]),
    ...long,
    ...(long.length === 0 ? [] : [splitAdvice(ctx.lang)]),
    // The tasks' own warnings first; the criteria are the whole change's.
    ...criteriaWarnings(change.criteriaTests ?? [], ctx.lang, "agent"),
  ];
}

/**
 * In delegated mode, the agent writes the closing before accepting (`closingInAcceptance`), unless
 * the change goes without its closing phase (`flow.closing: false`, formats.md §6).
 */
function closingAhead(change: ChangeView, ctx: CardContext): boolean {
  return change.withoutClosing !== true && closingInAcceptance(change.kind, ctx.delegated === true);
}

/** An independent review first, if it is due; then the acceptance, the agent's or the person's. */
function acceptanceNext(change: ChangeView, ctx: CardContext): string {
  const t = translator(ctx.lang);
  if (change.recommendReview === true) {
    return t(
      `antes de pedir la aceptación, ejecuta \`${ctx.command} review\`: una revisión independiente del resultado con un modelo más fuerte.`,
      `before asking for the acceptance, run \`${ctx.command} review\`: an independent review of the result by a stronger model.`,
    );
  }
  if (closingAhead(change, ctx)) return closingAheadNext(change, ctx);
  return ctx.delegated === true
    ? t(
        `modo delegado: acepta tú el resultado con \`${ctx.command} accept\` y sigue su salida. Si el usuario pide ajustes, ejecuta \`${ctx.command} adjust "<petición literal>"\`.`,
        `delegated mode: accept the result yourself with \`${ctx.command} accept\` and follow its output. If the user asks for adjustments, run \`${ctx.command} adjust "<literal request>"\`.`,
      )
    : t(
        `pide al usuario que revise el resultado y lo acepte con \`${ctx.command} accept\` en su terminal o en la UI, y ${waitStep(ctx)}. Si pide ajustes, ejecuta \`${ctx.command} adjust "<petición literal>"\`.`,
        `ask the user to review the result and accept it with \`${ctx.command} accept\` in their terminal or UI, and ${waitStep(ctx)}. If they ask for adjustments, run \`${ctx.command} adjust "<literal request>"\`.`,
      );
}

/**
 * In delegated mode, the closing first, sent with `propose`, and then the acceptance, which closes
 * the change too; once it is sent, the acceptance.
 */
function closingAheadNext(change: ChangeView, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const adjust = t(
    `Si el usuario pide ajustes, ejecuta \`${ctx.command} adjust "<petición literal>"\`.`,
    `If the user asks for adjustments, run \`${ctx.command} adjust "<literal request>"\`.`,
  );
  const step = change.closingSubmitted
    ? t(
        `modo delegado: acepta tú el resultado con \`${ctx.command} accept\`: con el cierre ya enviado, lo acepta, lo cierra y lo aterriza en un solo paso; sigue su salida. Si el cierre debe cambiar, corrígelo y envíalo otra vez con \`${ctx.command} propose\`.`,
        `delegated mode: accept the result yourself with \`${ctx.command} accept\`: with the closing already sent, it accepts, closes and lands it in a single step; follow its output. If the closing must change, fix it and send it again with \`${ctx.command} propose\`.`,
      )
    : t(
        `modo delegado: escribe tú el cierre antes de aceptar: añade la sección «## Cierre» como dice CÓMO CERRAR y envíala con \`${ctx.command} propose\`; después acepta el resultado con \`${ctx.command} accept\`, que lo acepta, lo cierra y lo aterriza en un solo paso, y sigue su salida.`,
        `delegated mode: write the closing yourself before accepting: add the "## Closing" section as HOW TO CLOSE says and send it with \`${ctx.command} propose\`; then accept the result with \`${ctx.command} accept\`, which accepts, closes and lands it in a single step, and follow its output.`,
      );
  return `${step} ${adjust}`;
}
