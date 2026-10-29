// SPDX-License-Identifier: Apache-2.0
import {
  acceptAnywayQuestion,
  acceptanceSummary,
  acceptedLine,
  acceptQuestion,
  blockedCard,
  type ChangeView,
  checkStatus,
  closeCommitSubject,
  closedCard,
  decisionCard,
  delegatedFailureCard,
  headerOf,
  nothingPendingCard,
  type Output,
  parseSpec,
  quickClosedLine,
  quickClosing,
  runVerificationQuestion,
  serializeSpec,
  transition,
  verificationNoteTitle,
  verificationReusedNote,
} from "@baquia-dev/specty-core";
import { commitState } from "../flow/active";
import { verifyHints, withVerifyHints } from "../flow/detected";
import { archive, commitArchive } from "../flow/finish";
import { type Absorbed, absorbTarget, integrationOf, mergeTarget } from "../flow/integrate";
import { landChange, withIntegration } from "../flow/land";
import { codeTree, passedOnThisCode, recordFullVerification } from "../flow/verified";
import { changeView } from "../flow/views";
import { execute, tail } from "../io/exec";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { humanChange, postponed } from "./human";
import { pendingIntegration } from "./integrate";
import { thenNext } from "./next";

/**
 * `specty accept`: a person accepts the result; quick changes close right away. `verify` answers
 * beforehand whether to run the full verification first (the UI runs it on its own).
 */
export async function accept(session: Session, verify?: boolean): Promise<Output> {
  const guard = await humanChange(session, "accept");
  if (guard.kind === "output") return guard.output;
  const { cards } = session;
  if (guard.change.state.phase !== "acceptance")
    return nothingPendingCard(guard.change.state.id, guard.change.state.phase, "accept", cards);
  const pending = await pendingIntegration(session, guard.change, "accept");
  if (pending.kind === "wait") return pending.output;
  const { change } = pending;
  const merged = await mergeFirst(session, change);
  if (!merged.ok) return merged.output;
  const { terminal } = session.environment;
  const view = await changeView(session, change);
  // An epic has no code of its own: each of its slices was verified when it closed.
  const unverified =
    change.state.kind !== "epic" &&
    session.config.verify.full === undefined &&
    session.config.verify.default === undefined;
  terminal.note(view.title, acceptanceSummary(view, unverified, cards));
  const stopped = await verifyBeforeAccepting(session, change, verify);
  if (stopped !== undefined) return stopped;
  if (!(await terminal.confirm(acceptQuestion(view.title, session.lang))))
    return postponed(session, change.state);
  return accepted(session, change, view, merged.lines);
}

/**
 * The main branch comes into the change first, so that the full verification runs once, on the
 * merged code, and `close` has nothing left to merge unless main moves again. Main's folder is
 * not checked here: nothing lands yet.
 */
async function mergeFirst(session: Session, change: StoredChange): Promise<Absorbed> {
  const plan = await integrationOf(session, change.state);
  return plan === undefined
    ? { ok: true, lines: [] }
    : mergeTarget(session, plan, change, "accept");
}

/**
 * The full verification before accepting, unless it already passed on this code or the person
 * declines to run it: what stops the acceptance, or nothing.
 */
async function verifyBeforeAccepting(
  session: Session,
  change: StoredChange,
  verify: boolean | undefined,
): Promise<Output | undefined> {
  const full = await verificationToRun(session, change);
  if (full === undefined) return undefined;
  // In delegated mode the agent always runs the full verification, and never accepts a failure.
  const delegated = session.actor === "agent";
  const run =
    delegated ||
    (verify ??
      (await session.environment.terminal.confirm(runVerificationQuestion(full, session.lang))));
  return run ? runFullVerification(session, change, full, delegated) : undefined;
}

/** The configured full verification, unless the change is an epic or it passed on this code. */
async function verificationToRun(
  session: Session,
  change: StoredChange,
): Promise<string | undefined> {
  // An epic has no code of its own: each of its slices was verified when it closed.
  const configured = change.state.kind === "epic" ? undefined : session.config.verify.full;
  if (configured === undefined) return undefined;
  // It need not run again when it already passed on this same code: in the last task, say.
  const passed = await passedOnThisCode(session, change, configured);
  if (passed === undefined) return configured;
  const note = verificationReusedNote(configured, passed.task, session.lang);
  session.environment.terminal.note(note.title, note.text);
  return undefined;
}

/** Runs and records the full verification; a failure stops the agent, and asks the person. */
async function runFullVerification(
  session: Session,
  change: StoredChange,
  full: string,
  delegated: boolean,
): Promise<Output | undefined> {
  const { state } = change;
  const { terminal } = session.environment;
  const tree = await codeTree(session);
  const started = Date.now();
  const result = await execute(full, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    timeoutMs: session.config.verify.timeoutSec * 1000,
  });
  await recordFullVerification(session, change, {
    command: full,
    code: result.code,
    ms: Date.now() - started,
    output: tail(result),
    ...(tree === undefined ? {} : { tree }),
  });
  terminal.note(
    verificationNoteTitle(result.code === 0, session.lang),
    tail(result, 15).join("\n"),
  );
  if (result.code === 0) return undefined;
  if (delegated) return delegatedFailureCard(headerOf(state.id, state.phase), full, session.cards);
  return (await terminal.confirm(acceptAnywayQuestion(session.lang)))
    ? undefined
    : postponed(session, state);
}

/**
 * The person accepted: a quick change closes; any other goes on to its closing. `merged` says
 * how the main branch came in before the verification, if it did.
 */
async function accepted(
  session: Session,
  change: StoredChange,
  view: ChangeView,
  merged: readonly string[],
): Promise<Output> {
  const { state } = change;
  const { cards } = session;
  const moved = transition({
    phase: "acceptance",
    kind: state.kind,
    actor: "human",
    event: { type: "accept" },
  });
  if (!moved.ok)
    return blockedCard(headerOf(state.id, state.phase), moved.code, checkStatus(cards));
  if (moved.phase === "done")
    return closeQuick(
      session,
      change,
      view.tasks.map((task) => task.summary ?? task.title),
      merged,
    );
  await commitState(
    session,
    change,
    { ...state, phase: moved.phase },
    "change.accepted",
    { revision: state.revision },
    "human",
  );
  return thenNext(
    session,
    decisionCard(headerOf(state.id, moved.phase), [acceptedLine(session.lang), ...merged], cards),
  );
}

/** Quick lane: accepting closes the change, with the task summary as its closing. */
async function closeQuick(
  session: Session,
  change: StoredChange,
  summaries: readonly string[],
  merged: readonly string[],
): Promise<Output> {
  // As when closing, before it lands: main's folder is checked and main comes in again if it
  // moved since the verification. A refusal leaves the change in acceptance.
  const plan = await integrationOf(session, change.state);
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, change, "accept");
  if (absorbed?.ok === false) return absorbed.output;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const closing = quickClosing(summaries, session.lang);
  await writeText(
    change.files.spec,
    serializeSpec({ ...spec, sections: { ...spec.sections, closing } }),
  );
  const archived = await archive(
    session,
    change,
    { ...change.state, phase: "done" },
    "change.closed",
    { lane: "quick" },
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
      headerOf(change.state.id, "done"),
      quickClosedLine(commit, session.lang),
      landed?.landed === true ? undefined : change.state.branch,
      session.cards,
    ),
    [...merged, ...(absorbed?.lines ?? [])],
    landed,
  );
  return withVerifyHints(card, hints);
}
