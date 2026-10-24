// SPDX-License-Identifier: Apache-2.0
import {
  assertionWarnings,
  blockedCard,
  evaluateTaskScope,
  headerOf,
  isGoverned,
  longFileCard,
  longFileWarnings,
  NOTE_MAX,
  nextCard,
  type Output,
  outOfScopeCard,
  parseSpec,
  riskWarnings,
  scopeRulesFrom,
  section,
  specHash,
  splitAdvice,
  translator,
  verifyFailedCard,
  withLead,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import { assertionLosses } from "../flow/assertions";
import { longFilesOf } from "../flow/lines";
import { riskFindings } from "../flow/risk";
import { completeTask, type TaskNotes, verifyTask } from "../flow/task-done";
import { changeView } from "../flow/views";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
import { activateNextTask } from "./next";

/** `specty task done`: checks scope, runs the verification, commits and moves on. */
export async function taskDone(
  session: Session,
  taskId: string,
  summary: string,
  findings: readonly string[] = [],
): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const nextStep = t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`);
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    const header =
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase);
    return blockedCard(
      header,
      t("No hay ninguna tarea en implementación.", "No task is being implemented."),
      nextStep,
    );
  }
  const { state } = active;
  const header = headerOf(state.id, "implementing");
  const id = taskId.trim().toUpperCase();
  if (state.tasks[id]?.status !== "active") {
    return blockedCard(
      header,
      t(`${id} no es la tarea activa.`, `${id} is not the active task.`),
      nextStep,
    );
  }
  const emptyFinding = findings.some((finding) => finding.trim().length === 0);
  // Every next task card repeats them: one or two sentences each, refused before verifying.
  const longSummary = summary.trim().length > NOTE_MAX ? summary.trim().length : undefined;
  const longFinding = findings.map((finding) => finding.trim().length).find((n) => n > NOTE_MAX);
  if (longSummary !== undefined || longFinding !== undefined) {
    const [es, en] =
      longSummary !== undefined
        ? [`El resumen tiene ${longSummary}`, `The summary has ${longSummary}`]
        : [`Un hallazgo tiene ${longFinding}`, `A finding has ${longFinding}`];
    return {
      ...blockedCard(
        header,
        t(
          `${es} caracteres; el máximo es ${NOTE_MAX}, porque las tarjetas de las tareas siguientes lo repiten.`,
          `${en} characters; the most is ${NOTE_MAX}, since the next task cards repeat it.`,
        ),
        t(
          "dilo en una o dos frases (el detalle ya está en el commit) y vuelve a ejecutar `task done`.",
          "say it in one or two sentences (the detail is in the commit) and run `task done` again.",
        ),
      ),
      status: "invalid",
    };
  }
  if (summary.trim().length === 0 || emptyFinding) {
    return {
      ...blockedCard(
        header,
        emptyFinding
          ? t("Un hallazgo (--finding) está vacío.", "A finding (--finding) is empty.")
          : t("Falta el resumen (--summary).", "The summary (--summary) is missing."),
        t(
          `ejecuta \`${cards.command} task done ${id} --summary "<qué hiciste>"\`.`,
          `run \`${cards.command} task done ${id} --summary "<what you did>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  const spec = parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const task = spec.sections.tasks?.items.find((item) => item.id === id);
  if (
    task === undefined ||
    state.approved === undefined ||
    specHash(spec) !== state.approved.hash
  ) {
    return nextCard({ change: await changeView(session, active), dirty: [] }, cards);
  }
  const pending = state.pending.scopeRequests.find((request) => request.task === id);
  if (pending !== undefined) {
    return blockedCard(
      header,
      t(
        `${id} espera la decisión sobre ${pending.id}.`,
        `${id} is waiting for the decision on ${pending.id}.`,
      ),
      t(
        `sigue dentro del alcance y pide al usuario \`${cards.command} approve --scope ${pending.id}\`.`,
        `keep working within the scope and ask the user for \`${cards.command} approve --scope ${pending.id}\`.`,
      ),
    );
  }
  const stored = state.tasks[id];
  const changed = await session.git.changedSince(stored?.baseCommit);
  const governed = changed.filter(
    (file) =>
      !file.path.startsWith(".specty/") &&
      (isGoverned(file.path, session.config) ||
        (file.from !== undefined && isGoverned(file.from, session.config))),
  );
  const scope = evaluateTaskScope({
    changed: governed,
    taskFiles: task.files,
    extras: stored?.scopeExtra ?? [],
    rules: scopeRulesFrom(session.config),
  });
  if (!scope.ok) return outOfScopeCard(header, id, scope.outOfScope, cards);
  const long = await longFilesOf(session, stored?.baseCommit, changed);
  const tooLong = long.filter((file) => file.severity === "error");
  if (tooLong.length > 0) return longFileCard(header, id, tooLong, cards);

  const verified = await verifyTask(session, active, task);
  if (!verified.ok)
    return verifyFailedCard(header, id, verified.command, verified.code, verified.tail, cards);

  const notes: TaskNotes = {
    removedAssertions: await assertionLosses(session, stored?.baseCommit, changed),
    risks: await riskFindings(session, stored?.baseCommit, changed),
    findings: findings.map((finding) => finding.trim()),
    longFiles: long,
  };
  const done = await completeTask(session, verified.change, spec, task, summary.trim(), notes);
  const following =
    done.state.phase === "implementing" ? await activateNextTask(session, done) : done;
  const view = await changeView(session, following);
  const card = nextCard({ change: view, dirty: [] }, cards);
  const finished = view.tasks.filter((item) => item.id === id);
  const warnings = [
    ...assertionWarnings(finished, session.lang),
    ...riskWarnings(finished, session.lang),
  ];
  const longer = longFileWarnings(finished, session.lang);
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
    ...(longer.length === 0 ? [] : [splitAdvice(session.lang)]),
  ];
  return withLead(
    t(`${id} completada: commit ${done.commit}.`, `${id} done: commit ${done.commit}.`),
    { ...card, blocks: [...section(t("AVISOS", "WARNINGS"), lines), ...card.blocks] },
  );
}
