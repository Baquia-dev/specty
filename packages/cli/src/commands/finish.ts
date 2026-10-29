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
  closeCommitSubject,
  closedCard,
  closedLine,
  confirmCloseQuestion,
  headerOf,
  landQuestion,
  nothingPendingCard,
  type Output,
  parseSpec,
  resolvedIntegrationNote,
  type Spec,
  transition,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { verifyHints, withVerifyHints } from "../flow/detected";
import { archive, commitArchive } from "../flow/finish";
import { absorbTarget, integrationOf, isIncorporated } from "../flow/integrate";
import { landChange, withIntegration } from "../flow/land";
import { measureUsage, withUsage } from "../flow/usage";
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

/** The closing confirmed: the main branch comes in, the change is archived and lands. */
async function closeConfirmed(session: Session, change: StoredChange, spec: Spec): Promise<Output> {
  const { state } = change;
  // The main branch comes into the change before anything is archived: a refusal changes nothing.
  const plan = await integrationOf(session, state);
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, change, "close");
  if (absorbed?.ok === false) return absorbed.output;
  const moved = transition({
    phase: "closing",
    kind: state.kind,
    actor: "human",
    event: { type: "confirmClose", closingSubmitted: true },
  });
  if (!moved.ok)
    return blockedCard(headerOf(state.id, state.phase), moved.code, checkStatus(session.cards));
  // Measured before archiving, so that the consumption goes with the change.
  const usage = await measureUsage(session, change);
  const archived = await archive(
    session,
    change,
    { ...state, phase: moved.phase },
    "change.closed",
    {},
  );
  const commit = await commitArchive(
    session,
    change,
    archived,
    closeCommitSubject(spec.title, session.lang),
  );
  // Read while the folder exists: landing removes a worktree of its own.
  const hints = await verifyHints(session, plan?.main ?? session.root);
  const landed = plan === undefined ? undefined : await landChange(session, plan);
  const card = withIntegration(
    session,
    closedCard(
      headerOf(state.id, "done"),
      closedLine(commit, session.lang),
      landed?.landed === true ? undefined : state.branch,
      session.cards,
    ),
    absorbed?.lines ?? [],
    landed,
  );
  return withVerifyHints(withUsage(card, usage), hints);
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
  const absorbed = await absorbTarget(session, plan, change, "close");
  if (!absorbed.ok) return absorbed.output;
  const landed = await landChange(session, plan);
  return withIntegration(
    session,
    closedCard(
      headerOf(state.id, "done"),
      alreadyClosedLine(session.lang),
      landed.landed ? undefined : state.branch,
      session.cards,
    ),
    absorbed.lines,
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
  return cancelledCard(
    headerOf(state.id, "cancelled"),
    cancelledLine(commit, session.lang),
    state.branch === undefined ? undefined : { name: state.branch, withCode },
    session.cards,
  );
}
