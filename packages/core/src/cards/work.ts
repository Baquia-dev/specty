// SPDX-License-Identifier: Apache-2.0
import { counted, type Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { riskLabel } from "../scope/risk";
import { criteriaTestLines, criteriaWarnings } from "./criteria";
import { epicCard, sliceLines } from "./epic";
import { longFileWarnings, splitAdvice } from "./lines";
import { effortLabel, progressOf, translator } from "./text";
import type { CardContext, ChangeView, TaskView } from "./view";

// Cards while the change is being built: tasks, acceptance, adjustments and closing.

/**
 * The longest a task's summary or finding may be: every next task card repeats them, and the
 * card keeps to about 1,500 tokens (ARCHITECTURE §7).
 */
export const NOTE_MAX = 300;

export function implementingCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  if (change.specChanged) {
    return {
      status: "blocked",
      header: headerOf(change.id, "implementing"),
      blocks: section(undefined, [
        t(
          "La spec cambió después de aprobarla; mientras se implementa está bloqueada.",
          "The spec changed after it was approved; it is locked while it is implemented.",
        ),
      ]),
      next: t(
        `restaura la versión aprobada con \`git checkout -- ${change.specPath}\`.`,
        `restore the approved version with \`git checkout -- ${change.specPath}\`.`,
      ),
    };
  }
  // An epic has no tasks: it advances through its slices, each one a change of its own.
  if (change.kind === "epic") return epicCard(change, ctx);
  const task = change.tasks.find((item) => item.status === "active");
  if (task === undefined) return acceptanceCard(change, ctx);
  return taskCard(change, task, ctx);
}

/** The task card: everything the agent needs for one task, and nothing else. */
export function taskCard(change: ChangeView, task: TaskView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const implicit = ctx.implicitTests
    ? [t("+ tests y archivos generados junto a ellos", "+ tests and generated files next to them")]
    : [];
  const done = change.tasks.filter((item) => item.status === "done").map(doneLine);
  const pending = change.pendingScope
    .filter((request) => request.task === task.id)
    .map((request) => `${request.id}: ${request.paths.join(", ")} — ${request.reason}`);
  return {
    status: "ok",
    header: headerOf(change.id, "implementing", progressOf(change, ctx.lang)),
    blocks: [
      ...section(undefined, [
        t(`TAREA ${task.id}: ${task.title}`, `TASK ${task.id}: ${task.title}`),
      ]),
      ...section(t("ARCHIVOS PERMITIDOS", "ALLOWED FILES"), [
        ...task.files,
        ...task.extras,
        ...implicit,
      ]),
      ...section(
        t("CRITERIOS", "CRITERIA"),
        task.criteria.map((criterion) => `${criterion.id}: ${criterion.text}`),
      ),
      ...section(t("CONVENCIONES", "CONVENTIONS"), change.conventions),
      ...section(t("HECHO", "DONE"), done),
      ...section(t("HALLAZGOS", "FINDINGS"), findingLines(change.tasks)),
      ...section(t("ALCANCE PENDIENTE DE APROBACIÓN", "SCOPE AWAITING APPROVAL"), pending),
      ...section("TESTS", testLines(task, ctx)),
      ...section(undefined, verificationLines(task, ctx)),
    ],
    next: t(
      `implementa ${task.id} y ejecuta \`${ctx.command} task done ${task.id} --summary "<qué hiciste>"\`.`,
      `implement ${task.id} and run \`${ctx.command} task done ${task.id} --summary "<what you did>"\`.`,
    ),
  };
}

/** A done task: its summary, or its title, and its commit. */
function doneLine(task: TaskView): string {
  return `${task.id} ${task.summary ?? task.title}${task.commit === undefined ? "" : ` (${task.commit})`}`;
}

/** How the task is verified, and the effort it suggests. */
function verificationLines(task: TaskView, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  return [
    ...(task.verify === undefined
      ? []
      : [t(`VERIFICACIÓN: ${task.verify}`, `VERIFICATION: ${task.verify}`)]),
    t(
      `ESFUERZO SUGERIDO: ${effortLabel(task.effort, ctx)}`,
      `SUGGESTED EFFORT: ${effortLabel(task.effort, ctx)}`,
    ),
  ];
}

/** What the done tasks learned (`task done --finding`), one line each. */
function findingLines(tasks: readonly TaskView[]): string[] {
  return tasks.flatMap((task) => (task.findings ?? []).map((text) => `${task.id}: ${text}`));
}

/** Test first for new behaviour, and an existing failing test is a finding, not something to bend. */
function testLines(task: TaskView, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  if (task.testRules === undefined) return [];
  return [
    ...(task.testRules === "first"
      ? [
          t(
            "Primero el test: escribe el que comprueba cada criterio, con su id en el nombre (`AC1: …`), y míralo fallar; después, el código.",
            "Test first: write the test that checks each criterion, with its id in the name (`AC1: …`), and watch it fail; then the code.",
          ),
        ]
      : []),
    t(
      "Si falla un test que ya existía, no lo cambies para que pase: para y explícaselo al usuario.",
      "If a test that already existed fails, do not change it to make it pass: stop and explain it to the user.",
    ),
  ];
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

export function adjustingCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(change.id, "adjusting"),
    blocks: [
      ...section(
        t("PETICIÓN", "REQUEST"),
        change.adjustment === undefined ? [] : [change.adjustment],
      ),
      ...section(t("CÓMO CLASIFICARLA", "HOW TO CLASSIFY IT"), [
        t(
          "Defecto (incumple un criterio): añade una tarea `type: fix` que lo referencie en `ac`.",
          "Defect (a criterion is not met): add a `type: fix` task that references it in `ac`.",
        ),
        t(
          "Refinamiento (cambia un detalle de un criterio): ajusta el criterio y añade una tarea.",
          "Refinement (a detail of a criterion changes): adjust the criterion and add a task.",
        ),
        t(
          "Alcance nuevo (ningún criterio lo cubre o choca con «Fuera de alcance»): no edites la spec; explícaselo al usuario y propón un cambio de seguimiento.",
          'New scope (no criterion covers it, or it contradicts "Out of scope"): do not edit the spec; explain it to the user and suggest a follow-up change.',
        ),
        t(
          "No modifiques ni borres tareas completadas; usa ids nuevos.",
          "Do not modify or remove done tasks; use new ids.",
        ),
      ]),
    ],
    next: t(
      `edita ${change.specPath} y ejecuta \`${ctx.command} propose\`.`,
      `edit ${change.specPath} and run \`${ctx.command} propose\`.`,
    ),
  };
}

/** The closing is written and waits for its confirmation: the agent's, delegated, or the person's. */
function closingSubmittedCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const delegated = ctx.delegated === true;
  return {
    status: "ok",
    header: headerOf(change.id, "closing"),
    blocks: section(undefined, [
      delegated
        ? t(
            "Cierre enviado; en modo delegado lo confirmas tú.",
            "Closing submitted; in delegated mode you confirm it.",
          )
        : t(
            "Cierre enviado; falta la confirmación del usuario.",
            "Closing submitted; waiting for the user's confirmation.",
          ),
    ]),
    next: delegated
      ? t(
          `modo delegado: confirma tú el cierre con \`${ctx.command} close\` y sigue su salida.`,
          `delegated mode: confirm the closing yourself with \`${ctx.command} close\` and follow its output.`,
        )
      : t(
          `pide al usuario que lo confirme con \`${ctx.command} close\` y termina tu turno.`,
          `ask the user to confirm it with \`${ctx.command} close\` and end your turn.`,
        ),
  };
}

export function closingCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  if (change.closingSubmitted) return closingSubmittedCard(change, ctx);
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
  return {
    status: "ok",
    header: headerOf(change.id, "closing"),
    blocks: [
      ...section(t("CÓMO CERRAR", "HOW TO CLOSE"), [
        t(
          `Añade al final de ${change.specPath} la sección «## Cierre» con ${headings}.`,
          `Add a "## Closing" section at the end of ${change.specPath} with ${headings}.`,
        ),
        t("No cambies nada más de la spec.", "Do not change anything else in the spec."),
      ]),
      ...section(
        t("HALLAZGOS DE LAS TAREAS", "FINDINGS OF THE TASKS"),
        findings.length === 0 ? [] : [...findings, carry],
      ),
    ],
    next: t(
      `escribe el cierre y ejecuta \`${ctx.command} propose\`.`,
      `write the closing and run \`${ctx.command} propose\`.`,
    ),
  };
}
