// SPDX-License-Identifier: Apache-2.0
import { type Output, section } from "../output";
import { blockedCard, withLead } from "./flow";
import { longFileWarnings, splitAdvice } from "./lines";
import { nextCard } from "./next";
import { runNext, translator } from "./text";
import type { CardContext, ChangeView } from "./view";
import { assertionWarnings, NOTE_MAX, riskWarnings } from "./work";

/** Why `specty task done` completes nothing. */
export type TaskDoneRefusal =
  | { readonly reason: "not-implementing" }
  | { readonly reason: "not-active"; readonly task: string }
  /** Every next task card repeats a summary or a finding, so neither may pass NOTE_MAX. */
  | { readonly reason: "too-long"; readonly note: "summary" | "finding"; readonly length: number }
  | { readonly reason: "empty"; readonly note: "summary" | "finding"; readonly task: string }
  | { readonly reason: "scope-pending"; readonly task: string; readonly request: string };

/** A `specty task done` that completes nothing: `invalid` when its notes are what is wrong. */
export function taskDoneRefusalCard(
  refusal: TaskDoneRefusal,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  switch (refusal.reason) {
    case "not-implementing":
      return blockedCard(
        header,
        t("No hay ninguna tarea en implementación.", "No task is being implemented."),
        runNext(ctx),
      );
    case "not-active":
      return blockedCard(
        header,
        t(`${refusal.task} no es la tarea activa.`, `${refusal.task} is not the active task.`),
        runNext(ctx),
      );
    case "too-long":
    case "empty":
      return { ...noteRefusalCard(refusal, header, ctx), status: "invalid" };
    case "scope-pending":
      return blockedCard(
        header,
        t(
          `${refusal.task} espera la decisión sobre ${refusal.request}.`,
          `${refusal.task} is waiting for the decision on ${refusal.request}.`,
        ),
        t(
          `sigue dentro del alcance y pide al usuario \`${ctx.command} approve --scope ${refusal.request}\`.`,
          `keep working within the scope and ask the user for \`${ctx.command} approve --scope ${refusal.request}\`.`,
        ),
      );
  }
}

/** A summary or a finding that is too long or empty. */
function noteRefusalCard(
  refusal: Extract<TaskDoneRefusal, { readonly reason: "too-long" | "empty" }>,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  if (refusal.reason === "empty") {
    return blockedCard(
      header,
      refusal.note === "finding"
        ? t("Un hallazgo (--finding) está vacío.", "A finding (--finding) is empty.")
        : t("Falta el resumen (--summary).", "The summary (--summary) is missing."),
      t(
        `ejecuta \`${ctx.command} task done ${refusal.task} --summary "<qué hiciste>"\`.`,
        `run \`${ctx.command} task done ${refusal.task} --summary "<what you did>"\`.`,
      ),
    );
  }
  const [es, en] =
    refusal.note === "summary"
      ? [`El resumen tiene ${refusal.length}`, `The summary has ${refusal.length}`]
      : [`Un hallazgo tiene ${refusal.length}`, `A finding has ${refusal.length}`];
  return blockedCard(
    header,
    t(
      `${es} caracteres; el máximo es ${NOTE_MAX}, porque las tarjetas de las tareas siguientes lo repiten.`,
      `${en} characters; the most is ${NOTE_MAX}, since the next task cards repeat it.`,
    ),
    t(
      "dilo en una o dos frases (el detalle ya está en el commit) y vuelve a ejecutar `task done`.",
      "say it in one or two sentences (the detail is in the commit) and run `task done` again.",
    ),
  );
}

/**
 * A completed task: its commit leads the card of what comes next, after the warnings about what
 * it removed, risked or left long, each with what to do about it.
 */
export function taskDoneCard(
  change: ChangeView,
  task: string,
  commit: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const finished = change.tasks.filter((item) => item.id === task);
  const warnings = [...assertionWarnings(finished, ctx.lang), ...riskWarnings(finished, ctx.lang)];
  const longer = longFileWarnings(finished, ctx.lang);
  const lines = [
    ...warnings,
    ...(warnings.length === 0
      ? []
      : [
          t(
            "Si no era parte de la tarea, explícaselo al usuario: lo verá al aceptar.",
            "If it was not part of the task, explain it to the user: they will see it on acceptance.",
          ),
        ]),
    ...longer,
    ...(longer.length === 0 ? [] : [splitAdvice(ctx.lang)]),
  ];
  const card = nextCard({ change, dirty: [] }, ctx);
  return withLead(t(`${task} completada: commit ${commit}.`, `${task} done: commit ${commit}.`), {
    ...card,
    blocks: [...section(t("AVISOS", "WARNINGS"), lines), ...card.blocks],
  });
}

/** Why `specty scope add` extends nothing. */
export type ScopeAddRefusal =
  | { readonly reason: "not-implementing" }
  /** `task` is empty when none was named and none is active. */
  | { readonly reason: "not-active"; readonly task: string }
  | { readonly reason: "invalid-paths"; readonly paths: readonly string[]; readonly task: string }
  /** No path, or no reason. */
  | { readonly reason: "incomplete"; readonly task: string };

/** A `specty scope add` that extends nothing: `invalid` when its paths or reason are wrong. */
export function scopeAddRefusalCard(
  refusal: ScopeAddRefusal,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  switch (refusal.reason) {
    case "not-implementing":
      return blockedCard(
        header,
        t(
          "Solo se amplía el alcance durante la implementación.",
          "Scope is only extended during implementation.",
        ),
        runNext(ctx),
      );
    case "not-active":
      return blockedCard(
        header,
        t(
          `${refusal.task || "La tarea"} no está activa.`,
          `${refusal.task || "The task"} is not active.`,
        ),
        runNext(ctx),
      );
    case "invalid-paths":
    case "incomplete":
      return {
        ...blockedCard(
          header,
          refusal.reason === "invalid-paths"
            ? t(
                `Rutas no válidas: ${refusal.paths.join(", ")}.`,
                `Invalid paths: ${refusal.paths.join(", ")}.`,
              )
            : t(
                "Indica al menos una ruta y el motivo (--reason).",
                "Give at least one path and the reason (--reason).",
              ),
          t(
            `ejecuta \`${ctx.command} scope add <ruta> --task ${refusal.task} --reason "<motivo>"\`.`,
            `run \`${ctx.command} scope add <path> --task ${refusal.task} --reason "<reason>"\`.`,
          ),
        ),
        status: "invalid",
      };
  }
}

/** The lead of a `scope add` whose paths the task may already change. */
export function inScopeLead(ctx: CardContext): string {
  return translator(ctx.lang)(
    "Esas rutas ya están dentro del alcance.",
    "Those paths are already within the scope.",
  );
}

/** A path the policy approved: `planned` when the approved spec lists it, for `tasks` if any. */
export interface AutoApproved {
  readonly path: string;
  readonly planned: boolean;
  readonly tasks: readonly string[];
}

/** The lead of an extension the policy approved: each path, and where the spec already had it. */
export function autoApprovedLead(approved: readonly AutoApproved[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const described = approved.map((entry) => {
    if (!entry.planned) return entry.path;
    const tasks = entry.tasks.join(", ");
    return entry.tasks.length === 0
      ? t(`${entry.path} (ya en Archivos)`, `${entry.path} (already in Files)`)
      : t(
          `${entry.path} (ya en Archivos, prevista para ${tasks})`,
          `${entry.path} (already in Files, planned for ${tasks})`,
        );
  });
  return t(
    `Ampliación aprobada por la política: ${described.join(", ")}.`,
    `Extension approved by policy: ${described.join(", ")}.`,
  );
}
