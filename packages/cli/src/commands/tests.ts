// SPDX-License-Identifier: Apache-2.0
import {
  approvalPostponedCard,
  approveTestsQuestion,
  askAgentNext,
  blockedCard,
  type ChangeState,
  classifyPath,
  decisionCard,
  headerOf,
  isGoverned,
  isTestFile,
  moduleOf,
  nothingPendingCard,
  type Output,
  parseSpec,
  runNext,
  type Spec,
  scopeRulesFrom,
  shortHash,
  testsApprovedLine,
  testsRefusedCard,
  testsSubmittedCard,
  transition,
} from "@baquia-dev/specty-core";
import { commitState } from "../flow/active";
import { changeTrailers, commitWithReceipt, decisionTrailers } from "../flow/commits";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { thenNext } from "./next";

// The tests of a feature, sent and approved before its code (ADR 0014).

/**
 * `specty propose` in the testing phase: commits the new tests of the change's files, alone, and
 * the change waits for the person. Nothing is sent without new tests, or with other code changed.
 */
export async function proposeTests(session: Session, active: StoredChange): Promise<Output> {
  const { cards } = session;
  const { state, files } = active;
  const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
  const changed = (await session.git.changedSince(await session.git.head()))
    .flatMap((file) => (file.from === undefined ? [file.path] : [file.from, file.path]))
    .filter((path) => isGoverned(path, session.config));
  const tests = changed.filter((path) => isTestOfChange(session, spec, path));
  const code = changed.filter((path) => !tests.includes(path));
  if (code.length > 0) return testsRefusedCard(state.id, { reason: "code", paths: code }, cards);
  if (tests.length === 0) return testsRefusedCard(state.id, { reason: "no-tests" }, cards);
  const moved = transition({
    phase: "testing",
    kind: state.kind,
    actor: session.actor,
    event: { type: "propose", validationErrors: 0 },
  });
  if (!moved.ok) return blockedCard(headerOf(state.id, "testing"), moved.code, runNext(cards));
  const sent: ChangeState = { ...state, testsSubmittedAt: session.environment.now().toISOString() };
  await commitState(session, active, sent, "tests.proposed", { count: tests.length, files: tests });
  const dir = session.paths.relative(files.dir);
  const scope = moduleOf(tests[0] ?? "");
  const commit = await commitWithReceipt(session, {
    subject: `test${scope === "(root)" ? "" : `(${scope})`}: ${spec.title}`,
    trailers: changeTrailers(session, state.id, { "Specty-Spec": specTrailer(state) }),
    stage: [tests, [dir]],
    only: [...tests, dir],
    receipt: { change: state.id, kind: "tests" },
  });
  return testsSubmittedCard(state.id, { commit, files: tests }, cards);
}

/** A test the testing phase lets the agent write: of a file in Files or in a task, or next to one. */
function isTestOfChange(session: Session, spec: Spec, path: string): boolean {
  const planned = [
    ...(spec.sections.files?.items ?? []).map((entry) => entry.path),
    ...(spec.sections.tasks?.items ?? []).flatMap((task) => task.files),
  ];
  const verdict = classifyPath(path, {
    taskFiles: planned,
    extras: [],
    rules: scopeRulesFrom(session.config),
  });
  return isTestFile(path) && (verdict === "declared" || verdict === "implicit-test");
}

/**
 * `specty approve` in the testing phase, the gate 2: the person, or the agent in delegated mode,
 * approves the tests sent, and the change goes on to its tasks.
 */
export async function approveTests(session: Session, active: StoredChange): Promise<Output> {
  const { cards } = session;
  const { state, files } = active;
  if (state.testsSubmittedAt === undefined) {
    return nothingPendingCard(state.id, "testing", "approve", cards);
  }
  const header = headerOf(state.id, "testing");
  const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
  if (
    !(await session.environment.terminal.confirm(approveTestsQuestion(spec.title, session.lang)))
  ) {
    return approvalPostponedCard(header, cards);
  }
  const moved = transition({
    phase: "testing",
    kind: state.kind,
    actor: "human",
    event: { type: "approveTests", testsSubmitted: true },
  });
  if (!moved.ok) return blockedCard(header, moved.code, askAgentNext(cards));
  // The person who delegated stays the decision's; the channel records that the agent approved.
  const channel =
    session.actor === "agent" ? "delegated" : (session.environment.terminal.channel ?? "tty");
  const { testsSubmittedAt: _sent, ...rest } = state;
  await commitState(
    session,
    active,
    { ...rest, phase: moved.phase },
    "tests.approved",
    { channel },
    "human",
  );
  const dir = session.paths.relative(files.dir);
  const commit = await commitWithReceipt(session, {
    subject: `test(spec): ${spec.title}`,
    trailers: decisionTrailers(session, state.id, { "Specty-Spec": specTrailer(state) }),
    stage: [[dir]],
    only: [dir],
    receipt: { change: state.id, kind: "spec" },
  });
  return thenNext(
    session,
    decisionCard(headerOf(state.id, moved.phase), [testsApprovedLine(commit, session.lang)], cards),
  );
}

/** The approved revision the tests answer to, as every commit of the change names it. */
function specTrailer(state: ChangeState): string {
  return `r${state.approved?.revision ?? state.revision}@${shortHash(state.approved?.hash ?? "")}`;
}
