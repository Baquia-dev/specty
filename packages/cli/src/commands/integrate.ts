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
  verifyingNote,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { changeTrailers, commitWithReceipt } from "../flow/commits";
import { blocked } from "../flow/integrate";
import { execute, tail } from "../io/exec";
import { readText } from "../io/files";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

/** A conflict marker left at the start of a line. */
const MARKER = /^(?:<{7}|>{7})(?:\s|$)|^={7}$/m;

/**
 * `specty integrate`: the agent finishes the merge a closing left in this folder. Nothing is
 * committed unless every conflict is resolved, the changes stay within the files the merge brings
 * together and the verification passes (ARCHITECTURE §9).
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
  const problem = await mergeProblem(session, integration);
  if (problem !== undefined) {
    return {
      status: "blocked",
      header: headerOf(state.id, state.phase, mergingLabel(integration.target, lang)),
      blocks: [...section(undefined, [problem.reason]), problem.details],
      next: problem.next ?? integrateRetry(cards),
    };
  }
  return commitMerge(session, change, integration, again);
}

type Integration = NonNullable<StoredChange["state"]["integration"]>;

/** Why the merge cannot be committed yet, what to show, and what to do if not to retry. */
interface MergeProblem {
  readonly reason: string;
  readonly details: OutputBlock;
  readonly next?: string;
}

/** Conflict markers left, changes outside the files the merge brings together, or a failing verification. */
async function mergeProblem(
  session: Session,
  integration: Integration,
): Promise<MergeProblem | undefined> {
  return (
    (await markersLeft(session, integration)) ??
    (await outsideChanges(session, integration)) ??
    (await failedVerification(session))
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

async function failedVerification(session: Session): Promise<MergeProblem | undefined> {
  const { config, lang } = session;
  const command = config.verify.full ?? config.verify.default;
  if (command === undefined) return undefined;
  session.environment.io.err(verifyingNote(command, lang));
  const result = await execute(command, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    timeoutMs: config.verify.timeoutSec * 1000,
  });
  if (result.code === 0) return undefined;
  return {
    reason: commandFailsLine(command, lang),
    details: { title: incorporationTitle("verification", lang), lines: tail(result, 15) },
  };
}

/** The merge resolved: its commit, recorded in the change's state. */
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
  await commitState(
    session,
    change,
    { ...state, integration: { ...integration, resolved: { commit, at } } },
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
