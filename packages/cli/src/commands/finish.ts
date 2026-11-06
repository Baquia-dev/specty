// SPDX-License-Identifier: Apache-2.0
import {
  alreadyClosedLine,
  blockedCard,
  type ChangeState,
  cancelCommitSubject,
  cancelledCard,
  cancelledLine,
  cancelQuestion,
  cancelReasonQuestion,
  checkStatus,
  closedCard,
  confirmCloseQuestion,
  headerOf,
  landQuestion,
  leaveFolderNext,
  nothingPendingCard,
  type Output,
  parseSpec,
  resolvedIntegrationNote,
  type Spec,
  transition,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { withArchivedMemory } from "../flow/archive-memory";
import { closeOnTurn } from "../flow/closing-turn";
import { archive, commitArchive } from "../flow/finish";
import { landingTurn } from "../flow/full-verification";
import { absorbTarget, integrationOf, isIncorporated } from "../flow/integrate";
import { type Landed, landRetrying, withIntegration } from "../flow/land";
import { type CancelledFolder, removeCancelled, withCleanupFrom } from "../flow/prune";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { writePointer } from "../store/local";
import { humanChange, postponed } from "./human";
import { pendingIntegration } from "./integrate";

/** `specty close`: a person confirms the closing and the change is archived. */
export async function close(session: Session): Promise<Output> {
  const guard = await humanChange(session, "close");
  if (guard.kind === "output") return guard.output;
  const found = guard.change.state;
  if (found.phase === "done") return landClosed(session, guard.change);
  if (found.phase !== "closing" || found.closingSubmittedAt === undefined) {
    return nothingPendingCard(found.id, found.phase, "close", session.cards);
  }
  const pending = await pendingIntegration(session, guard.change, "close");
  if (pending.kind === "wait") return pending.output;
  const { change } = pending;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  noteClosing(session, change.state, spec);
  if (!(await session.environment.terminal.confirm(confirmCloseQuestion(session.lang))))
    return postponed(session, change.state);
  return closeConfirmed(session, change, spec);
}

/** What the person confirms: the closing, and how the incorporation was resolved, if it was. */
function noteClosing(session: Session, state: ChangeState, spec: Spec): void {
  const { terminal } = session.environment;
  terminal.note(spec.title, spec.sections.closing ?? "");
  const resolved = state.integration?.resolved;
  if (state.integration === undefined || resolved === undefined) return;
  const { target, conflicts } = state.integration;
  const note = resolvedIntegrationNote(
    { target, commit: resolved.commit, conflicts },
    session.lang,
  );
  terminal.note(note.title, note.text);
}

/**
 * The closing confirmed: the main branch comes in, the change is archived and lands, all on the
 * full verification's turn, so that no other session lands in between.
 */
async function closeConfirmed(session: Session, change: StoredChange, spec: Spec): Promise<Output> {
  const plan = await integrationOf(session, change.state);
  return landingTurn(session, plan, () => closeOnTurn(session, change, spec, plan));
}

/** A closed change that did not reach the main branch (its landing failed): retries only that. */
async function landClosed(session: Session, change: StoredChange): Promise<Output> {
  const { state } = change;
  const plan = await integrationOf(session, state);
  if (plan === undefined || (await isIncorporated(session, plan)))
    return nothingPendingCard(state.id, state.phase, "close", session.cards);
  if (
    !(await session.environment.terminal.confirm(
      landQuestion(plan.branch, plan.target, session.lang),
    ))
  )
    return postponed(session, state);
  return landingTurn(session, plan, async () => {
    const absorbed = await absorbTarget(session, plan, change, "close");
    if (!absorbed.ok) return absorbed.output;
    const landed = await landRetrying(session, plan);
    return withCleanupFrom(session, plan.main, landedAgain(session, state, absorbed.lines, landed));
  });
}

/** The card of a closed change whose incorporation was retried. */
function landedAgain(
  session: Session,
  state: ChangeState,
  absorbed: readonly string[],
  landed: Landed,
): Output {
  return withIntegration(
    session,
    closedCard(
      headerOf(state.id, "done"),
      alreadyClosedLine(session.lang),
      landed.landed ? undefined : state.branch,
      session.cards,
    ),
    absorbed,
    landed,
  );
}

/** `specty cancel`: a person abandons the change; it is archived as cancelled. */
export async function cancel(session: Session, reason: string | undefined): Promise<Output> {
  const guard = await humanChange(session, "cancel");
  if (guard.kind === "output") return guard.output;
  const { change } = guard;
  const { state } = change;
  const { terminal } = session.environment;
  if (isFinished(state)) return nothingPendingCard(state.id, state.phase, "cancel", session.cards);
  const why = reason ?? (await terminal.ask(cancelReasonQuestion(session.lang)));
  if (!(await terminal.confirm(cancelQuestion(state.id, session.lang))))
    return postponed(session, state);
  return cancelConfirmed(session, change, why?.trim());
}

/** The cancellation confirmed: the change is archived as cancelled; its branch keeps its work. */
async function cancelConfirmed(
  session: Session,
  change: StoredChange,
  why: string | undefined,
): Promise<Output> {
  const { state } = change;
  const moved = transition({
    phase: state.phase,
    kind: state.kind,
    actor: "human",
    event: { type: "cancel" },
  });
  if (!moved.ok)
    return blockedCard(headerOf(state.id, state.phase), moved.code, checkStatus(session.cards));
  const archived = await archive(
    session,
    change,
    { ...state, phase: moved.phase },
    "change.cancelled",
    { ...(why !== undefined && why.length > 0 ? { reason: why } : {}) },
  );
  if (state.kind === "retro") await writePointer(session.git, "retro", undefined);
  const commit = await commitArchive(
    session,
    change,
    archived,
    cancelCommitSubject(state.id, session.lang),
  );
  // `task done` commits each task's code; the state cannot hold that commit's own hash.
  const withCode = Object.values(state.tasks).some((task) => task.status === "done");
  // Asked before the folder goes: the clean-up after it runs from the main folder.
  const main = (await session.git.worktrees())[0]?.folder;
  const folder = await leaveCancelled(session, state);
  const card = await withCleanupFrom(
    session,
    main,
    cancelledCard(
      headerOf(state.id, "cancelled"),
      cancelledLine(commit, session.lang),
      state.branch === undefined ? undefined : { name: state.branch, withCode },
      session.cards,
      folderLines(folder),
    ),
  );
  // The agent that cancelled from inside leaves the folder, as after `close`.
  const left = folder?.left;
  return withArchivedMemory(
    session,
    left === undefined ? card : { ...card, next: leaveFolderNext(left, session.cards) },
    archived,
  );
}

/**
 * Once the archive is committed, the branch keeps it all, also what the folder had uncommitted:
 * the cancelled change's own folder goes (`removeCancelled`). Nothing for a change with no branch.
 */
async function leaveCancelled(
  session: Session,
  state: ChangeState,
): Promise<CancelledFolder | undefined> {
  if (state.branch === undefined) return undefined;
  return removeCancelled(session, { id: state.id, branch: state.branch });
}

/**
 * The card's lines of the cancelled change's folder: the commit of what it had uncommitted, if
 * any, and what became of it.
 */
function folderLines(folder: CancelledFolder | undefined): readonly string[] {
  if (folder === undefined) return [];
  return folder.saved === undefined ? [folder.line] : [folder.saved, folder.line];
}
