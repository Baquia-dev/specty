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
  lockedIncorporationProblem,
  markersLeftLine,
  mergeAbortedLine,
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
import { changeTrailers, commitWithReceipt } from "../flow/commits";
import { fullCommand } from "../flow/full-verification";
import { blocked } from "../flow/integrate";
import { fullPlan, runFull } from "../flow/units";
import { incorporatedTests, relockedTests } from "../flow/unlock-check";
import { codeTree, type FullRun, recordFullVerification } from "../flow/verified";
import { readText } from "../io/files";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

/** A conflict marker left at the start of a line. */
const MARKER = /^(?:<{7}|>{7})(?:\s|$)|^={7}$/m;

/**
 * `specty integrate`: the agent finishes the merge a closing left in this folder. Nothing is
 * committed unless every conflict is resolved, the changes stay within the files the merge brings
 * together, each approved test changed only as it may (ADR 0014) and the verification passes
 * (ARCHITECTURE §9).
 */
export async function integrate(session: Session): Promise<Output> {
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
  const problem = await mergeProblem(session, change, integration);
  if (problem !== undefined) {
    return {
      status: "blocked",
      header: headerOf(state.id, state.phase, mergingLabel(integration.target, lang)),
      blocks: [...section(undefined, [problem.reason]), ...problem.details],
      next: problem.next ?? integrateRetry(cards),
    };
  }
  return commitMerge(session, change, integration, again);
}

type Integration = NonNullable<StoredChange["state"]["integration"]>;

/** Why the merge cannot be committed yet, what to show, and what to do if not to retry. */
interface MergeProblem {
  readonly reason: string;
  readonly details: readonly OutputBlock[];
  readonly next?: string;
}

/**
 * Conflict markers left, changes outside the files the merge brings together, an approved test
 * changed as it may not, or a failing verification.
 */
async function mergeProblem(
  session: Session,
  change: StoredChange,
  integration: Integration,
): Promise<MergeProblem | undefined> {
  return (
    (await markersLeft(session, integration)) ??
    (await outsideChanges(session, integration)) ??
    (await lockedChanged(session, change, integration)) ??
    (await failedVerification(session, change))
  );
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
    details: [{ title: incorporationTitle("markers", session.lang), lines: marked }],
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
    details: [{ title: incorporationTitle("outside", lang), lines: outside }],
    next: undoOutsideNext(session.cards),
  };
}

/**
 * An approved test the incorporation changed without the person's unlock, or not as the patch of
 * the one they approved for it leaves it (ADR 0014).
 */
async function lockedChanged(
  session: Session,
  change: StoredChange,
  integration: Integration,
): Promise<MergeProblem | undefined> {
  if (change.state.lockedTests === undefined) return undefined;
  const found = await incorporatedTests(session, change, integration);
  if (found.changed.length === 0 && found.mismatches.length === 0) return undefined;
  return lockedIncorporationProblem(found, integration.target, session.cards);
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
    details: [{ title: incorporationTitle("verification", lang), lines: ran.output.slice(-15) }],
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

/**
 * The merge resolved: its commit, recorded in the change's state with each approved test locked
 * again as the merge leaves it.
 */
async function commitMerge(
  session: Session,
  change: StoredChange,
  integration: Integration,
  again: "accept" | "close",
): Promise<Output> {
  const { state } = change;
  const { target } = integration;
  const commit = await commitWithReceipt(session, {
    subject: `Merge branch '${target}' into ${state.branch ?? state.id}`,
    trailers: changeTrailers(session, state.id),
    stage: [[".", ":(exclude).specty"]],
    receipt: { change: state.id, kind: "close" },
  });
  const at = session.environment.now().toISOString();
  const lockedTests = await relockedTests(session, state);
  await commitState(
    session,
    change,
    {
      ...state,
      integration: { ...integration, resolved: { commit, at } },
      ...(lockedTests === undefined ? {} : { lockedTests }),
    },
    "integration.resolved",
    { commit },
  );
  return {
    status: "ok",
    header: headerOf(state.id, state.phase),
    blocks: section(undefined, [integrationResolvedLine(target, commit, session.lang)]),
    next: runAgainNext(again, session.cards),
  };
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
