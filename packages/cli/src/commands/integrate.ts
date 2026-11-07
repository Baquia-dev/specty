// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  classifyPath,
  commandFailsLine,
  headerOf,
  incorporationTitle,
  integrateRetry,
  integrationResolvedLine,
  isGoverned,
  isIntegrating,
  markersLeftLine,
  mergeAbortedLine,
  mergedAgainLine,
  mergingLabel,
  noIncorporationCard,
  type Output,
  type OutputBlock,
  outsideIncorporationLine,
  resolveIncorporationNext,
  runAgainNext,
  scopeRulesFrom,
  section,
  stillResolvingLine,
  undoOutsideNext,
  unitsLines,
  unitsReusedNote,
  verifyingNote,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { closingFirst } from "../flow/closing-turn";
import { changeTrailers, commitWithReceipt } from "../flow/commits";
import { fullCommand, landingTurn } from "../flow/full-verification";
import {
  type Absorbed,
  blocked,
  contains,
  integrationOf,
  type Integration as Landing,
  mergeTarget,
} from "../flow/integrate";
import { fullPlan, runFull } from "../flow/units";
import { codeTree, type FullRun, recordFullVerification } from "../flow/verified";
import { readText } from "../io/files";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

/** A conflict marker left at the start of a line. */
const MARKER = /^(?:<{7}|>{7})(?:\s|$)|^={7}$/m;

/** What `integrate` goes on with in delegated mode: the command that left the incorporation. */
export type Resume = (again: "accept" | "close") => Promise<Output>;

/**
 * `specty integrate`: the agent finishes the merge a closing left in this folder. Nothing is
 * committed unless every conflict is resolved and the changes stay within the files the merge
 * brings together; then, on the landing turn, the verification passes, or main moved on and comes
 * in again (ARCHITECTURE §9). In delegated mode, `resume` goes on with the agent's command.
 */
export async function integrate(session: Session, resume: Resume): Promise<Output> {
  const { cards, git, lang } = session;
  const change = await resolveActive(session);
  const integration = change?.state.integration;
  if (change === undefined || integration === undefined || !isIntegrating(change.state)) {
    return noIncorporationCard(headerOf(change?.state.id, change?.state.phase), cards);
  }
  const { state } = change;
  const again = state.phase === "acceptance" ? "accept" : "close";
  if ((await git.run(["rev-parse", "-q", "--verify", "MERGE_HEAD"])).code !== 0) {
    return blocked(state, [mergeAbortedLine(lang)], undefined, runAgainNext(again, cards));
  }
  const problem = await mergeProblem(session, integration);
  if (problem !== undefined) return problemCard(session, state, integration, problem);
  const plan = await integrationOf(session, state);
  const resolved = { change, integration, again } as const;
  return landingTurn(session, plan, () => integrateOnTurn(session, resolved, plan, resume));
}

type Integration = NonNullable<StoredChange["state"]["integration"]>;

/** Why the merge cannot be committed yet, what to show, and what to do if not to retry. */
interface MergeProblem {
  readonly reason: string;
  readonly details: OutputBlock;
  readonly next?: string;
}

/**
 * Conflict markers left, or changes outside the files the merge brings together: checked before
 * the landing turn, which they do not need.
 */
async function mergeProblem(
  session: Session,
  integration: Integration,
): Promise<MergeProblem | undefined> {
  return (await markersLeft(session, integration)) ?? (await outsideChanges(session, integration));
}

/** The merge cannot be committed yet: why, and what to do. */
function problemCard(
  session: Session,
  state: StoredChange["state"],
  integration: Integration,
  problem: MergeProblem,
): Output {
  return {
    status: "blocked",
    header: headerOf(state.id, state.phase, mergingLabel(integration.target, session.lang)),
    blocks: [...section(undefined, [problem.reason]), problem.details],
    next: problem.next ?? integrateRetry(session.cards),
  };
}

/** The incorporation the agent resolved, and the command that left it. */
interface Resolved {
  readonly change: StoredChange;
  readonly integration: Integration;
  readonly again: "accept" | "close";
}

/**
 * On the landing turn, so that nobody lands meanwhile: if main moved on since the merge the agent
 * resolved, its commit, and main comes in again, verified once with all of it (`mergeAgain`);
 * otherwise, its verification and its commit. In delegated mode, the agent's command follows on
 * the same turn (`resume`), so that the change lands without another verification.
 */
async function integrateOnTurn(
  session: Session,
  resolved: Resolved,
  plan: Landing | undefined,
  resume: Resume,
): Promise<Output> {
  const done =
    plan !== undefined && !(await contains(session.git, "MERGE_HEAD", plan.target))
      ? await mergeAgain(session, resolved, plan)
      : await verifiedCommit(session, resolved);
  if (!done.ok) return done.output;
  const lines = section(undefined, done.lines);
  if (session.actor === "agent" && session.delegated) {
    const resumed = await resume(resolved.again);
    return { ...resumed, blocks: [...lines, ...resumed.blocks] };
  }
  const { state } = resolved.change;
  return {
    status: "ok",
    header: headerOf(state.id, state.phase),
    blocks: lines,
    next: runAgainNext(resolved.again, session.cards),
  };
}

/** Main did not move: the merge's verification and, if it passes, its commit. */
async function verifiedCommit(session: Session, resolved: Resolved): Promise<Absorbed> {
  const { change, integration } = resolved;
  const failed = await failedVerification(session, change);
  if (failed !== undefined)
    return { ok: false, output: problemCard(session, change.state, integration, failed) };
  const { commit } = await commitMerge(session, resolved);
  return { ok: true, lines: [integrationResolvedLine(integration.target, commit, session.lang)] };
}

/**
 * Main moved on while the agent resolved the merge: verifying it would check stale code. Its
 * commit goes first, unverified, and main comes in again (`mergeTarget`), with its verification,
 * or with a new incorporation for the agent; main only ever receives the verified merge.
 */
async function mergeAgain(session: Session, resolved: Resolved, plan: Landing): Promise<Absorbed> {
  const { change, commit } = await commitMerge(session, resolved);
  const { again } = resolved;
  const absorbed = await mergeTarget(session, plan, change, again, closingFirst(session, change));
  if (!absorbed.ok) return absorbed;
  const { target } = resolved.integration;
  const { lang } = session;
  const first = [integrationResolvedLine(target, commit, lang), mergedAgainLine(target, lang)];
  return { ok: true, lines: [...first, ...absorbed.lines] };
}

async function markersLeft(
  session: Session,
  integration: Integration,
): Promise<MergeProblem | undefined> {
  const marked: string[] = [];
  for (const path of integration.conflicts) {
    if (MARKER.test((await readText(join(session.root, path))) ?? "")) marked.push(path);
  }
  if (marked.length === 0) return undefined;
  return {
    reason: markersLeftLine(session.lang),
    details: { title: incorporationTitle("markers", session.lang), lines: marked },
  };
}

async function outsideChanges(
  session: Session,
  integration: Integration,
): Promise<MergeProblem | undefined> {
  const { config, lang } = session;
  const rules = scopeRulesFrom(config);
  const outside = pathsOf(await session.git.changedSince("HEAD")).filter(
    (path) =>
      !path.startsWith(".specty/") &&
      isGoverned(path, config) &&
      classifyPath(path, { taskFiles: integration.paths, extras: [], rules }) === "out-of-scope",
  );
  if (outside.length === 0) return undefined;
  return {
    reason: outsideIncorporationLine(integration.target, lang),
    details: { title: incorporationTitle("outside", lang), lines: outside },
    next: undoOutsideNext(session.cards),
  };
}

/**
 * The full verification of the merged code, live: with `verify.units`, only the units that have
 * not passed, none when every one did, and what each did goes to the error output. One that runs
 * and passes goes to the audit with the code it ran on, so that `accept` does not run it again.
 */
async function failedVerification(
  session: Session,
  change: StoredChange,
): Promise<MergeProblem | undefined> {
  const { config, lang } = session;
  const { err } = session.environment.io;
  const command = fullCommand(config) ?? config.verify.default;
  if (command === undefined) return undefined;
  const plan = await fullPlan(session, command);
  if (plan.units?.pending.length === 0) {
    err(unitsReusedNote(plan.units.reused, lang).text);
    return undefined;
  }
  err(verifyingNote(plan.runs, lang));
  let started = Date.now();
  // A full verification like any other: on its turn, with every place of the clone; its time
  // counts from that turn.
  const ran = await runFull(session, change.state.id, plan, () => {
    started = Date.now();
  });
  if (ran.units !== undefined) err(unitsLines(ran.units, lang).join("\n"));
  if (ran.code === 0) {
    await recordPassed(session, change, { ...ran, command, started, ms: Date.now() - started });
    return undefined;
  }
  return {
    reason: commandFailsLine(ran.command, lang),
    details: { title: incorporationTitle("verification", lang), lines: ran.output.slice(-15) },
  };
}

/**
 * A full verification that passed on the merged code, as `change.verified` with the code it ran
 * on: the working tree with the merge resolved, which is what its commit takes.
 */
async function recordPassed(session: Session, change: StoredChange, run: FullRun): Promise<void> {
  const tree = await codeTree(session);
  await recordFullVerification(session, change, tree === undefined ? run : { ...run, tree });
}

/** The merge resolved: its commit, recorded in the change's state. */
async function commitMerge(
  session: Session,
  { change, integration }: Resolved,
): Promise<{ readonly change: StoredChange; readonly commit: string }> {
  const { state } = change;
  const { target } = integration;
  const commit = await commitWithReceipt(session, {
    subject: `Merge branch '${target}' into ${state.branch ?? state.id}`,
    trailers: changeTrailers(session, state.id),
    stage: [[".", ":(exclude).specty"]],
    receipt: { change: state.id, kind: "close" },
  });
  const at = session.environment.now().toISOString();
  const committed = await commitState(
    session,
    change,
    { ...state, integration: { ...integration, resolved: { commit, at } } },
    "integration.resolved",
    { commit },
  );
  return { change: committed, commit };
}

export type Pending =
  | { readonly kind: "wait"; readonly output: Output }
  | { readonly kind: "go"; readonly change: StoredChange };

/**
 * Before closing or accepting: while the agent's merge is still in progress the person waits for
 * it; a merge someone aborted is forgotten, and the incorporation starts over.
 */
export async function pendingIntegration(
  session: Session,
  change: StoredChange,
  again: "close" | "accept",
): Promise<Pending> {
  const { integration, ...rest } = change.state;
  if (integration === undefined || integration.resolved !== undefined)
    return { kind: "go", change };
  if ((await session.git.run(["rev-parse", "-q", "--verify", "MERGE_HEAD"])).code === 0) {
    const waiting = stillResolvingLine(integration.target, session.lang);
    const next = resolveIncorporationNext(again, session.cards);
    return { kind: "wait", output: blocked(change.state, [waiting], undefined, next) };
  }
  const forgotten = await commitState(
    session,
    change,
    rest,
    "integration.abandoned",
    { target: integration.target },
    "specty",
  );
  return { kind: "go", change: forgotten };
}
