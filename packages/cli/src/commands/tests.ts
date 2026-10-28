// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import {
  approvalPostponedCard,
  approveTestsQuestion,
  askAgentNext,
  basename,
  blockedCard,
  type ChangeState,
  classifyPath,
  decisionCard,
  hashText,
  headerOf,
  isGoverned,
  isTestFile,
  moduleOf,
  nothingPendingCard,
  type Output,
  parseSpec,
  runNext,
  type Sha256Hash,
  type Spec,
  scopeRulesFrom,
  shortHash,
  type TestsRefusal,
  testRules,
  testsApprovedLine,
  testsRefusedCard,
  testsSubmittedCard,
  transition,
} from "@baquia-dev/specty-core";
import { checkContext } from "../check/files";
import { commitState } from "../flow/active";
import { dataOf, readAudit } from "../flow/carried";
import { changeTrailers, commitWithReceipt, decisionTrailers } from "../flow/commits";
import { untestedBeforeCode } from "../flow/criteria-tests";
import { runLive } from "../flow/live-run";
import { readText } from "../io/files";
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
  const untested = await untestedBeforeCode(spec, await checkContext(session, "changed"));
  if (untested.length > 0) {
    return testsRefusedCard(state.id, { reason: "untested", criteria: untested }, cards);
  }
  const red = await redOf(session, state.id, spec, tests);
  if (red.kind === "refused") return testsRefusedCard(state.id, red.refusal, cards);
  const moved = transition({
    phase: "testing",
    kind: state.kind,
    actor: session.actor,
    event: { type: "propose", validationErrors: 0 },
  });
  if (!moved.ok) return blockedCard(headerOf(state.id, "testing"), moved.code, runNext(cards));
  const sent: ChangeState = { ...state, testsSubmittedAt: session.environment.now().toISOString() };
  await commitState(session, active, sent, "tests.proposed", {
    count: tests.length,
    files: tests,
    red: red.failed,
  });
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

/** The tests are red, with the commands that failed; or why they cannot be sent yet. */
type Red =
  | {
      readonly kind: "red";
      readonly failed: readonly { readonly cmd: string; readonly exit: number | null }[];
    }
  | { readonly kind: "refused"; readonly refusal: TestsRefusal };

/**
 * The verification of the tasks that ask for their test first, each command once and without
 * `verify.quick`: it must fail, and its output must name each new test (A5 of ADR 0014's epic).
 */
async function redOf(
  session: Session,
  id: string,
  spec: Spec,
  tests: readonly string[],
): Promise<Red> {
  const { policy, verify } = session.config;
  const commands = [
    ...new Set(
      (spec.sections.tasks?.items ?? [])
        .filter((task) => testRules(task, policy.tests) === "first")
        .flatMap((task) => task.verify ?? verify.default ?? []),
    ),
  ];
  const failed: { readonly cmd: string; readonly exit: number | null }[] = [];
  const output: string[] = [];
  for (const cmd of commands) {
    const result = await runLive(session, id, "tests", cmd);
    if (result.code === 0) continue;
    failed.push({ cmd, exit: result.code ?? null });
    output.push(result.stdout, result.stderr);
  }
  if (failed.length === 0) return { kind: "refused", refusal: { reason: "green", commands } };
  const said = output.join("\n");
  const unnamed = tests.filter((path) => !namesOf(path).some((name) => said.includes(name)));
  return unnamed.length > 0
    ? { kind: "refused", refusal: { reason: "unnamed", paths: unnamed } }
    : { kind: "red", failed };
}

/** How a runner names a test file: its path, its name, or its name without the extension. */
function namesOf(path: string): readonly string[] {
  const name = basename(path);
  return [path, name, name.replace(/\.[^.]+$/, "")];
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
  const lockedTests = { ...state.lockedTests, ...(await sentHashes(session, active)) };
  await commitState(
    session,
    active,
    { ...rest, phase: moved.phase, lockedTests },
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

/**
 * The hash of each test of the last sending (`tests.proposed`), as the person approves it: they
 * stay locked from then on (ADR 0014). A test that sending deleted is not locked.
 */
async function sentHashes(
  session: Session,
  active: StoredChange,
): Promise<Record<string, Sha256Hash>> {
  const sent = (await readAudit(active.files)).findLast(
    (entry) => entry.event === "tests.proposed",
  );
  const paths = dataOf(sent).files;
  const hashes = await Promise.all(
    (Array.isArray(paths) ? paths : [])
      .filter((path): path is string => typeof path === "string")
      .map(async (path) => {
        const text = await readText(join(session.root, path));
        return text === undefined ? [] : [[path, hashText(text)] as const];
      }),
  );
  return Object.fromEntries(hashes.flat());
}

/** The approved revision the tests answer to, as every commit of the change names it. */
function specTrailer(state: ChangeState): string {
  return `r${state.approved?.revision ?? state.revision}@${shortHash(state.approved?.hash ?? "")}`;
}
