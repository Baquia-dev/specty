// SPDX-License-Identifier: Apache-2.0
import {
  acceptAnywayQuestion,
  acceptanceSummary,
  acceptedLine,
  acceptQuestion,
  blockedCard,
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
import { absorbTarget, integrationOf } from "../flow/integrate";
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
  const { state } = change;
  const { terminal } = session.environment;
  const view = await changeView(session, change);
  // An epic has no code of its own: each of its slices was verified when it closed.
  const epic = state.kind === "epic";
  const unverified =
    !epic &&
    session.config.verify.full === undefined &&
    session.config.verify.default === undefined;
  terminal.note(view.title, acceptanceSummary(view, unverified, cards));
  const configured = epic ? undefined : session.config.verify.full;
  // It need not run again when it already passed on this same code: in the last task, say.
  const passed =
    configured === undefined ? undefined : await passedOnThisCode(session, change, configured);
  if (configured !== undefined && passed !== undefined) {
    const note = verificationReusedNote(configured, passed.task, session.lang);
    terminal.note(note.title, note.text);
  }
  const full = passed === undefined ? configured : undefined;
  // In delegated mode the agent always runs the full verification, and never accepts a failure.
  const delegated = session.actor === "agent";
  if (
    full !== undefined &&
    (delegated || (verify ?? (await terminal.confirm(runVerificationQuestion(full, session.lang)))))
  ) {
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
    if (result.code !== 0 && delegated)
      return delegatedFailureCard(headerOf(state.id, state.phase), full, cards);
    if (result.code !== 0 && !(await terminal.confirm(acceptAnywayQuestion(session.lang))))
      return postponed(session, state);
  }
  if (!(await terminal.confirm(acceptQuestion(view.title, session.lang))))
    return postponed(session, state);
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
    decisionCard(headerOf(state.id, moved.phase), [acceptedLine(session.lang)], cards),
  );
}

/** Quick lane: accepting closes the change, with the task summary as its closing. */
async function closeQuick(
  session: Session,
  change: StoredChange,
  summaries: readonly string[],
): Promise<Output> {
  // As when closing: the main branch comes in first, and a refusal leaves it in acceptance.
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
    absorbed?.lines ?? [],
    landed,
  );
  return withVerifyHints(card, hints);
}
