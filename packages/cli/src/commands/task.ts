// SPDX-License-Identifier: Apache-2.0
import {
  evaluateTaskScope,
  headerOf,
  isGoverned,
  longFileCard,
  NOTE_MAX,
  nextCard,
  type Output,
  outOfScopeCard,
  parseSpec,
  scopeRulesFrom,
  specHash,
  type Task,
  taskDoneCard,
  taskDoneRefusalCard,
  verifyFailedCard,
  verifyingNote,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import { assertionLosses } from "../flow/assertions";
import { longFilesOf } from "../flow/lines";
import { riskFindings } from "../flow/risk";
import { completeTask, type TaskNotes, verifyTask } from "../flow/task-done";
import { changeView, taskVerification } from "../flow/views";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
import { taskChecks } from "./check";
import { activateNextTask } from "./next";

/** `specty task done`: checks scope, runs the verification, commits and moves on. */
export async function taskDone(
  session: Session,
  taskId: string,
  summary: string,
  findings: readonly string[] = [],
): Promise<Output> {
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    const header =
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase);
    return taskDoneRefusalCard({ reason: "not-implementing" }, header, cards);
  }
  const { state } = active;
  const header = headerOf(state.id, "implementing");
  const id = taskId.trim().toUpperCase();
  if (state.tasks[id]?.status !== "active") {
    return taskDoneRefusalCard({ reason: "not-active", task: id }, header, cards);
  }
  const emptyFinding = findings.some((finding) => finding.trim().length === 0);
  // Every next task card repeats them: one or two sentences each, refused before verifying.
  const longSummary = summary.trim().length > NOTE_MAX ? summary.trim().length : undefined;
  const longFinding = findings.map((finding) => finding.trim().length).find((n) => n > NOTE_MAX);
  if (longSummary !== undefined) {
    return taskDoneRefusalCard(
      { reason: "too-long", note: "summary", length: longSummary },
      header,
      cards,
    );
  }
  if (longFinding !== undefined) {
    return taskDoneRefusalCard(
      { reason: "too-long", note: "finding", length: longFinding },
      header,
      cards,
    );
  }
  if (summary.trim().length === 0 || emptyFinding) {
    return taskDoneRefusalCard(
      { reason: "empty", note: emptyFinding ? "finding" : "summary", task: id },
      header,
      cards,
    );
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
    return taskDoneRefusalCard(
      { reason: "scope-pending", task: id, request: pending.id },
      header,
      cards,
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
  const failedCheck = await checkFails(session, state.id, task, header);
  if (failedCheck !== undefined) return failedCheck;

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
  return taskDoneCard(await changeView(session, following), id, done.commit, cards);
}

/**
 * `specty check --changed --spec` before the task's verification (ADR 0012): the card of a
 * failure, or nothing. Warnings do not block, so their report goes to stderr, before the card.
 */
async function checkFails(
  session: Session,
  change: string,
  task: Task,
  header: string,
): Promise<Output | undefined> {
  const command = `${session.cards.command} check --changed --spec`;
  session.environment.io.err(verifyingNote(command, session.lang));
  const checked = await taskChecks(session, change, taskVerification(session, task) !== undefined);
  const lines = checked.report.split("\n");
  if (checked.code !== 0) {
    return verifyFailedCard(header, task.id, command, checked.code, lines, session.cards);
  }
  if (lines.length > 1) session.environment.io.err(checked.report);
  return undefined;
}
