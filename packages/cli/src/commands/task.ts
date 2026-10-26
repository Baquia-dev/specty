// SPDX-License-Identifier: Apache-2.0
import {
  type ChangedFile,
  evaluateTaskScope,
  headerOf,
  isGoverned,
  type LongFile,
  longFileCard,
  NOTE_MAX,
  nextCard,
  type Output,
  outOfScopeCard,
  parseSpec,
  type ResolvedConfig,
  type Spec,
  scopeRulesFrom,
  specHash,
  type Task,
  type TaskDoneRefusal,
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
import { readSpec, type StoredChange } from "../store/changes";
import { taskChecks } from "./check";
import { activateNextTask } from "./next";

/** `specty task done`: checks scope, runs the verification, commits and moves on. */
export async function taskDone(
  session: Session,
  taskId: string,
  summary: string,
  findings: readonly string[] = [],
): Promise<Output> {
  const ready = await taskToComplete(session, taskId, summary, findings);
  if ("card" in ready) return ready.card;
  const { active, spec, task, header } = ready;
  const { cards } = session;
  const diff = await checkedDiff(session, active, task, header);
  if ("card" in diff) return diff.card;

  const verified = await verifyTask(session, active, task);
  if (!verified.ok)
    return verifyFailedCard(header, task.id, verified.command, verified.code, verified.tail, cards);

  const notes: TaskNotes = {
    removedAssertions: await assertionLosses(session, diff.base, diff.changed),
    risks: await riskFindings(session, diff.base, diff.changed),
    findings: findings.map((finding) => finding.trim()),
    longFiles: diff.long,
  };
  const done = await completeTask(session, verified.change, spec, task, summary.trim(), notes);
  const following =
    done.state.phase === "implementing" ? await activateNextTask(session, done) : done;
  return taskDoneCard(await changeView(session, following), task.id, done.commit, cards);
}

/** The active task of an approved spec that hasn't changed, or the card of what stops it first. */
async function taskToComplete(
  session: Session,
  taskId: string,
  summary: string,
  findings: readonly string[],
): Promise<
  | { readonly card: Output }
  | {
      readonly active: StoredChange;
      readonly spec: Spec;
      readonly task: Task;
      readonly header: string;
    }
> {
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    const header =
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase);
    return { card: taskDoneRefusalCard({ reason: "not-implementing" }, header, cards) };
  }
  const { state } = active;
  const header = headerOf(state.id, "implementing");
  const id = taskId.trim().toUpperCase();
  if (state.tasks[id]?.status !== "active") {
    return { card: taskDoneRefusalCard({ reason: "not-active", task: id }, header, cards) };
  }
  const refusal = notesRefusal(id, summary, findings);
  if (refusal !== undefined) return { card: taskDoneRefusalCard(refusal, header, cards) };
  const spec = parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const task = spec.sections.tasks?.items.find((item) => item.id === id);
  if (
    task === undefined ||
    state.approved === undefined ||
    specHash(spec) !== state.approved.hash
  ) {
    return { card: nextCard({ change: await changeView(session, active), dirty: [] }, cards) };
  }
  return { active, spec, task, header };
}

/** Every next task card repeats the notes: one or two sentences each, refused before verifying. */
function notesRefusal(
  task: string,
  summary: string,
  findings: readonly string[],
): TaskDoneRefusal | undefined {
  const length = summary.trim().length;
  if (length > NOTE_MAX) return { reason: "too-long", note: "summary", length };
  const longFinding = findings.map((finding) => finding.trim().length).find((n) => n > NOTE_MAX);
  if (longFinding !== undefined)
    return { reason: "too-long", note: "finding", length: longFinding };
  const emptyFinding = findings.some((finding) => finding.trim().length === 0);
  if (length > 0 && !emptyFinding) return undefined;
  return { reason: "empty", note: emptyFinding ? "finding" : "summary", task };
}

/** The task's diff from its base commit, once `checkedDiff` lets it through; or the card that stops it. */
type CheckedDiff =
  | {
      readonly base: string | undefined;
      readonly changed: readonly ChangedFile[];
      readonly long: readonly LongFile[];
    }
  | { readonly card: Output };

/**
 * What `task done` checks on the task's diff before its verification: no scope request of the
 * task still pending, every file within its scope, none past the maximum length and
 * `specty check` passing.
 */
async function checkedDiff(
  session: Session,
  change: StoredChange,
  task: Task,
  header: string,
): Promise<CheckedDiff> {
  const { cards, config } = session;
  const { state } = change;
  const pending = state.pending.scopeRequests.find((request) => request.task === task.id);
  if (pending !== undefined) {
    const refusal = { reason: "scope-pending", task: task.id, request: pending.id } as const;
    return { card: taskDoneRefusalCard(refusal, header, cards) };
  }
  const stored = state.tasks[task.id];
  const base = stored?.baseCommit;
  const changed = await session.git.changedSince(base);
  const scope = evaluateTaskScope({
    changed: changed.filter((file) => isGovernedChange(file, config)),
    taskFiles: task.files,
    extras: stored?.scopeExtra ?? [],
    rules: scopeRulesFrom(config),
  });
  if (!scope.ok) return { card: outOfScopeCard(header, task.id, scope.outOfScope, cards) };
  const long = await longFilesOf(session, base, changed);
  const tooLong = long.filter((file) => file.severity === "error");
  if (tooLong.length > 0) return { card: longFileCard(header, task.id, tooLong, cards) };
  const failed = await checkFails(session, state.id, task, header);
  return failed === undefined ? { base, changed, long } : { card: failed };
}

/** A change outside `.specty/` to a governed path, or renamed from one. */
function isGovernedChange(file: ChangedFile, config: ResolvedConfig): boolean {
  if (file.path.startsWith(".specty/")) return false;
  return (
    isGoverned(file.path, config) || (file.from !== undefined && isGoverned(file.from, config))
  );
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
