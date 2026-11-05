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
  coverageLines,
  decisionCard,
  delegatedFailureCard,
  headerOf,
  noCodeVerificationNote,
  nothingPendingCard,
  type Output,
  parseSpec,
  quickClosedLine,
  quickClosing,
  riskLessons,
  riskLessonsLine,
  runVerificationQuestion,
  serializeSpec,
  transition,
  unitsLines,
  unitsReusedNote,
  verificationNoteTitle,
  verificationReusedNote,
} from "@baquia-dev/specty-core";
import { commitState } from "../flow/active";
import { harvestEntries, withArchivedMemory } from "../flow/archive-memory";
import { verifyHints, withVerifyHints } from "../flow/detected";
import { archive, commitArchive } from "../flow/finish";
import { landingTurn } from "../flow/full-verification";
import {
  type Absorbed,
  absorbTarget,
  type Integration,
  integrationOf,
  mergeTarget,
} from "../flow/integrate";
import { landRetrying, withIntegration } from "../flow/land";
import { type FullPlan, fullCommand, fullPlan, runFull } from "../flow/units";
import { measureUsage, withUsage } from "../flow/usage";
import { codeTree, passedOnThisCode, recordFullVerification, touchesCode } from "../flow/verified";
import { changeView } from "../flow/views";
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
  const plan = await integrationOf(session, change.state);
  const merged = await mergeFirst(session, plan, change);
  if (!merged.ok) return merged.output;
  const { terminal } = session.environment;
  const view = await changeView(session, change);
  // An epic has no code of its own: each of its slices was verified when it closed.
  const unverified =
    change.state.kind !== "epic" &&
    fullCommand(session.config) === undefined &&
    session.config.verify.default === undefined;
  terminal.note(view.title, acceptanceSummary(view, unverified, cards));
  const stopped = await verifyBeforeAccepting(session, change, plan?.target, verify);
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
async function mergeFirst(
  session: Session,
  plan: Integration | undefined,
  change: StoredChange,
): Promise<Absorbed> {
  return plan === undefined
    ? { ok: true, lines: [] }
    : mergeTarget(session, plan, change, "accept");
}

/**
 * The full verification before accepting, unless it need not run or the person declines to run
 * it: what stops the acceptance, or nothing. `target` is the branch the change goes to, if any.
 */
async function verifyBeforeAccepting(
  session: Session,
  change: StoredChange,
  target: string | undefined,
  verify: boolean | undefined,
): Promise<Output | undefined> {
  const plan = await verificationToRun(session, change, target);
  if (plan === undefined) return undefined;
  // In delegated mode the agent always runs the full verification, and never accepts a failure.
  const delegated = session.actor === "agent";
  const question = runVerificationQuestion(plan.runs, session.lang);
  const run = delegated || (verify ?? (await session.environment.terminal.confirm(question)));
  return run ? runFullVerification(session, change, plan, delegated) : undefined;
}

/**
 * The configured full verification, unless the change is an epic, it passed on this code, the
 * change touches no code, so that its code is the `target` branch's, or every unit passed already.
 */
async function verificationToRun(
  session: Session,
  change: StoredChange,
  target: string | undefined,
): Promise<FullPlan | undefined> {
  // An epic has no code of its own: each of its slices was verified when it closed.
  const configured = change.state.kind === "epic" ? undefined : fullCommand(session.config);
  if (configured === undefined) return undefined;
  const { terminal } = session.environment;
  // It need not run again when it already passed on this same code: in the last task, say.
  const passed = await passedOnThisCode(session, change, configured);
  if (passed !== undefined) {
    const note = verificationReusedNote(configured, passed.task, session.lang);
    terminal.note(note.title, note.text);
    return undefined;
  }
  if (target !== undefined && !(await touchesCode(session, target))) {
    const note = noCodeVerificationNote(configured, target, session.lang);
    terminal.note(note.title, note.text);
    return undefined;
  }
  const plan = await fullPlan(session, configured);
  if (plan.units?.pending.length !== 0) return plan;
  const note = unitsReusedNote(plan.units.reused, session.lang);
  terminal.note(note.title, note.text);
  return undefined;
}

/**
 * Runs and records the full verification of `plan`, live for `specty ui` and the chat as it goes;
 * a failure stops the agent, and asks the person.
 */
async function runFullVerification(
  session: Session,
  change: StoredChange,
  plan: FullPlan,
  delegated: boolean,
): Promise<Output | undefined> {
  const { state } = change;
  const { lang } = session;
  const { terminal } = session.environment;
  const tree = await codeTree(session);
  // Its time counts from its turn: the wait for another session's is not this verification's.
  let started = Date.now();
  const ran = await runFull(session, state.id, plan, () => {
    started = Date.now();
  });
  const { code, output, units } = ran;
  const ms = Date.now() - started;
  const coverage = await recordFullVerification(session, change, {
    command: plan.command,
    started,
    code,
    ms,
    output,
    ...(tree === undefined ? {} : { tree }),
    ...(units === undefined ? {} : { units }),
  });
  const { warn } = session.config.checks.coverage;
  const measured = coverage === undefined ? [] : coverageLines({ ...coverage, warn }, lang);
  const done = units === undefined ? [] : unitsLines(units, lang);
  terminal.note(
    verificationNoteTitle(code === 0, lang),
    [...output.slice(-15), ...done, ...measured].join("\n"),
  );
  if (code === 0) return undefined;
  if (delegated)
    return delegatedFailureCard(headerOf(state.id, state.phase), ran.command, session.cards);
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
  const lines = [...merged, ...(await acceptedRisks(session, change, view))];
  if (moved.phase === "done")
    return closeQuick(
      session,
      change,
      view.tasks.map((task) => task.summary ?? task.title),
      lines,
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
    decisionCard(headerOf(state.id, moved.phase), [acceptedLine(session.lang), ...lines], cards),
  );
}

/**
 * The risks of the change's tasks, which accepting takes, as lessons of the memory about their
 * files (ADR 0016), and the line that names them; none, no line.
 */
async function acceptedRisks(
  session: Session,
  change: StoredChange,
  view: ChangeView,
): Promise<string[]> {
  const lessons = riskLessons(view.tasks, session.lang);
  const ids = (await harvestEntries(session, change.state, lessons)).map(({ id }) => id);
  const line = riskLessonsLine(ids, session.lang);
  return line === undefined ? [] : [line];
}

/**
 * Quick lane: accepting closes the change, with the task summary as its closing. As when closing,
 * it lands on the full verification's turn, so that no other session lands in between.
 */
async function closeQuick(
  session: Session,
  change: StoredChange,
  summaries: readonly string[],
  merged: readonly string[],
): Promise<Output> {
  const plan = await integrationOf(session, change.state);
  return landingTurn(session, plan, () =>
    closeQuickOnTurn(session, change, plan, { summaries, merged }),
  );
}

async function closeQuickOnTurn(
  session: Session,
  change: StoredChange,
  plan: Integration | undefined,
  {
    summaries,
    merged,
  }: { readonly summaries: readonly string[]; readonly merged: readonly string[] },
): Promise<Output> {
  // As when closing, before it lands: main's folder is checked and main comes in again if it
  // moved since the verification. A refusal leaves the change in acceptance.
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, change, "accept");
  if (absorbed?.ok === false) return absorbed.output;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const closing = quickClosing(summaries, session.lang);
  await writeText(
    change.files.spec,
    serializeSpec({ ...spec, sections: { ...spec.sections, closing } }),
  );
  // Measured before archiving, so that the consumption goes with the change.
  const usage = await measureUsage(session, change);
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
  const landed = plan === undefined ? undefined : await landRetrying(session, plan);
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
  return withVerifyHints(withUsage(withArchivedMemory(session, card, archived), usage), hints);
}
