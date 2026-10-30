// SPDX-License-Identifier: Apache-2.0
import { counted, type Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { riskLabel } from "../scope/risk";
import { coverageLines } from "./coverage";
import { criteriaTestLines, criteriaWarnings } from "./criteria";
import { sliceLines } from "./epic";
import { longFileWarnings, splitAdvice } from "./lines";
import { translator } from "./text";
import type { CardContext, ChangeView, TaskView } from "./view";

// The acceptance card, and the lines it shares with the task cards.

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
        `${task.id}: ${risk.path}${risk.line === undefined ? "" : `:${risk.line}`} ${riskLabel(risk.rule, lang)}${risk.cwe === undefined ? "" : ` (${risk.cwe})`}.`,
    ),
  );
}

export function acceptanceCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
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

/** An independent review first, if it is due; then the acceptance, the agent's or the person's. */
function acceptanceNext(change: ChangeView, ctx: CardContext): string {
  const t = translator(ctx.lang);
  if (change.recommendReview === true) {
    return t(
      `antes de pedir la aceptación, ejecuta \`${ctx.command} review\`: una revisión independiente del resultado con un modelo más fuerte.`,
      `before asking for the acceptance, run \`${ctx.command} review\`: an independent review of the result by a stronger model.`,
    );
  }
  return ctx.delegated === true
    ? t(
        `modo delegado: acepta tú el resultado con \`${ctx.command} accept\` y sigue su salida. Si el usuario pide ajustes, ejecuta \`${ctx.command} adjust "<petición literal>"\`.`,
        `delegated mode: accept the result yourself with \`${ctx.command} accept\` and follow its output. If the user asks for adjustments, run \`${ctx.command} adjust "<literal request>"\`.`,
      )
    : t(
        `pide al usuario que revise el resultado y lo acepte con \`${ctx.command} accept\`. Si pide ajustes, ejecuta \`${ctx.command} adjust "<petición literal>"\`.`,
        `ask the user to review the result and accept it with \`${ctx.command} accept\`. If they ask for adjustments, run \`${ctx.command} adjust "<literal request>"\`.`,
      );
}
