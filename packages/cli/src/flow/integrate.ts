// SPDX-License-Identifier: Apache-2.0
import {
  absorbedLine,
  type ChangeState,
  headerOf,
  holderDirtyLine,
  holderDirtyNext,
  incorporationTitle,
  type MergeVerification,
  mergeByHandNext,
  mergedVerifyFailsLine,
  mergeFailedLine,
  notYetLine,
  type Output,
  type OutputBlock,
  resolveIncorporationNext,
  section,
  targetConflictsLine,
  unitsLines,
  verifyingNote,
} from "@baquia-dev/specty-core";
import { type ExecResult, tail } from "../io/exec";
import { type Git, resolved } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { commitState } from "./active";
import { commitWithReceipt, decisionTrailers } from "./commits";
import { fullCommand } from "./full-verification";
import { invalidMergedConfig } from "./merged-config";
import { type FullRan, fullPlan, runFull } from "./units";
import { codeTree, recordFullVerification, touchesCode } from "./verified";
import { targetBranch } from "./worktree";

/** How a finished change reaches the main branch (ARCHITECTURE §9, "Incorporación"). */
export interface Integration {
  readonly id: string;
  /** The branch that receives the change: `git.target`, or the main branch. */
  readonly target: string;
  readonly branch: string;
  /** The folder where `target` is checked out, if any. */
  readonly holder: string | undefined;
  /** The main worktree's folder. */
  readonly main: string;
  /** The change lives in the main worktree instead of a worktree of its own. */
  readonly inMain: boolean;
}

/** Kinds that end in the main branch: a spike is never merged and a retro has no branch. */
const INTEGRATED: ReadonlySet<ChangeState["kind"]> = new Set(["standard", "quick", "epic"]);

/** Where the change goes when it is finished, or undefined when Specty does not incorporate it. */
export async function integrationOf(
  session: Session,
  state: ChangeState,
): Promise<Integration | undefined> {
  const { git, config } = session;
  if (state.branch === undefined || !INTEGRATED.has(state.kind) || config.mode !== "individual")
    return undefined;
  const target = await targetBranch(git, config.git.target);
  if (target === undefined || target === state.branch) return undefined;
  const worktrees = await git.worktrees();
  const main = worktrees[0]?.folder ?? git.root;
  return {
    id: state.id,
    target,
    branch: state.branch,
    holder: worktrees.find((worktree) => worktree.branch === target)?.folder,
    main,
    inMain: (await resolved(main)) === (await resolved(git.root)),
  };
}

export type Absorbed =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly output: Output };

/** Nothing moved, or the merge waits for the agent: what the person sees. */
type Refused = Extract<Absorbed, { readonly ok: false }>;

/**
 * Before the change lands: refuses when the folder that holds the main branch has uncommitted
 * changes, which the fast-forward could overwrite, and then merges the main branch (`mergeTarget`).
 */
export async function absorbTarget(
  session: Session,
  plan: Integration,
  change: StoredChange,
  again: "close" | "accept",
  beforeMerge?: (target: string) => Promise<void>,
): Promise<Absorbed> {
  const dirty = await holderDirty(session, plan, change.state, again);
  return dirty ?? mergeTarget(session, plan, change, again, beforeMerge);
}

/**
 * When the main branch moved, merges it into the change's branch, here, and commits the merge
 * only after the verification passes. A merged configuration that is not valid aborts it, with or
 * without conflicts (`invalidMergedConfig`). With conflicts or a failing verification, the merge
 * stays in progress for the agent; a closed change's merge is aborted instead, as is any other
 * failure, and nothing moves. `again` is the command the person runs afterwards; `beforeMerge` runs only
 * when there is a merge to make, right before it.
 */
export async function mergeTarget(
  session: Session,
  plan: Integration,
  change: StoredChange,
  again: "close" | "accept",
  beforeMerge?: (target: string) => Promise<void>,
): Promise<Absorbed> {
  const { git, cards } = session;
  const { state } = change;
  if (await contains(git, "HEAD", plan.target)) return { ok: true, lines: [] };
  await beforeMerge?.(plan.target);
  const absorbing: Absorbing = {
    plan,
    change,
    again,
    forAgent: state.phase !== "done",
    byHand: mergeByHandNext(plan.target, again, cards),
  };
  const merged = await git.run(["merge", "--no-ff", "--no-commit", plan.target]);
  const config = await invalidMergedConfig(session, plan.target, again);
  if (config !== undefined) return refused(session, state, config.reason, config.next);
  if (merged.code !== 0) return mergeStopped(session, absorbing, merged);
  const verification = await mergeVerification(session, plan, state);
  if (verification.kind !== "passed") return commitAbsorbed(session, plan, verification);
  const verified = await verifyMerged(session, absorbing, verification.command);
  return verified.ok ? commitAbsorbed(session, plan, verified.verification) : verified;
}

/**
 * What verifies the merged code: the configured command, which must pass, or nothing, and why.
 * An epic has no code of its own: each of its slices was verified when it closed. A change that
 * touches only free files leaves the target's code, which was verified when it landed.
 */
async function mergeVerification(
  session: Session,
  plan: Integration,
  state: ChangeState,
): Promise<MergeVerification> {
  if (state.kind === "epic") return { kind: "epic" };
  const command = fullCommand(session.config) ?? session.config.verify.default;
  if (command === undefined) return { kind: "none" };
  if (!(await touchesCode(session, plan.target))) return { kind: "no-code" };
  return { kind: "passed", command };
}

/** A merge of the target branch under way, and what follows when it cannot be committed. */
interface Absorbing {
  readonly plan: Integration;
  readonly change: StoredChange;
  readonly again: "close" | "accept";
  /** An open change's merge stays in progress for the agent; a closed one's is aborted. */
  readonly forAgent: boolean;
  /** What the person does once the merge is aborted. */
  readonly byHand: string;
}

/** The folder that holds the target branch has uncommitted changes: nothing moves. */
async function holderDirty(
  session: Session,
  plan: Integration,
  state: ChangeState,
  again: "close" | "accept",
): Promise<Absorbed | undefined> {
  if (plan.holder === undefined) return undefined;
  const { git, cards, lang } = session;
  const dirty = lines((await git.run(["-C", plan.holder, "diff", "--name-only", "HEAD"])).stdout);
  if (dirty.length === 0) return undefined;
  return refused(
    session,
    state,
    holderDirtyLine(plan.target, plan.holder, lang),
    holderDirtyNext(plan.holder, again, cards),
    { title: incorporationTitle("uncommitted", lang), lines: dirty },
  );
}

/** The merge stopped: its conflicts go to the agent of an open change; otherwise it is aborted. */
async function mergeStopped(
  session: Session,
  absorbing: Absorbing,
  merged: ExecResult,
): Promise<Absorbed> {
  const { git, lang } = session;
  const { plan, change, again, byHand } = absorbing;
  const conflicts = lines((await git.run(["diff", "--name-only", "--diff-filter=U"])).stdout);
  const reason = targetConflictsLine(plan.target, lang);
  const details = { title: incorporationTitle("conflicts", lang), lines: conflicts };
  if (conflicts.length > 0 && absorbing.forAgent)
    return leaveForAgent(session, plan, change, again, { reason, conflicts, details });
  await git.run(["merge", "--abort"]);
  if (conflicts.length > 0) return refused(session, change.state, reason, byHand, details);
  const failed = mergeFailedLine(plan.target, reasonOf(merged), lang);
  return refused(session, change.state, failed, byHand);
}

/**
 * Runs the full verification with `command` on the merged code, live: with `verify.units`, only
 * the units that have not passed, and none when every one did. What verified it or, when it
 * fails, as when the merge stops.
 */
async function verifyMerged(
  session: Session,
  absorbing: Absorbing,
  command: string,
): Promise<{ readonly ok: true; readonly verification: MergeVerification } | Refused> {
  const { change } = absorbing;
  const plan = await fullPlan(session, command);
  if (plan.units?.pending.length === 0) {
    const units = { reused: plan.units.reused, passed: [], skipped: [] };
    return { ok: true, verification: { kind: "passed", command, units } };
  }
  session.environment.io.err(verifyingNote(plan.runs, session.lang));
  let started = Date.now();
  // One full verification at a time in the clone: the time counted starts with its turn.
  const ran = await runFull(session, change.state.id, plan, () => {
    started = Date.now();
  });
  if (ran.code !== 0) return failedVerification(session, absorbing, ran);
  const units = ran.units === undefined ? {} : { units: ran.units };
  // In the audit, so that `accept` does not run it again on this code; a closed change's audit
  // is already archived.
  if (change.state.phase !== "done") {
    const run = {
      command,
      started,
      code: 0,
      ms: Date.now() - started,
      output: ran.output,
      ...units,
    };
    const tree = await codeTree(session);
    await recordFullVerification(session, change, tree === undefined ? run : { ...run, tree });
  }
  return { ok: true, verification: { kind: "passed", command, ...units } };
}

/**
 * The verification of the merged code failed, as `ran` says: the merge stays for an open change's
 * agent, with the output of what failed and what each unit did; a closed change's is aborted.
 */
async function failedVerification(
  session: Session,
  absorbing: Absorbing,
  ran: FullRan,
): Promise<Refused> {
  const { git, lang } = session;
  const { plan, change, again, byHand } = absorbing;
  const reason = mergedVerifyFailsLine(plan.target, ran.command, lang);
  const done = ran.units === undefined ? [] : unitsLines(ran.units, lang);
  const lines = [...ran.output.slice(-15), ...done];
  const details = { title: incorporationTitle("verification", lang), lines };
  if (absorbing.forAgent)
    return leaveForAgent(session, plan, change, again, { reason, conflicts: [], details });
  await git.run(["merge", "--abort"]);
  return refused(session, change.state, reason, byHand, details);
}

/** Commits the merge, and says what checked it: with `verify.units`, also what each unit did. */
async function commitAbsorbed(
  session: Session,
  plan: Integration,
  verification: MergeVerification,
): Promise<Absorbed> {
  const commit = await commitWithReceipt(session, {
    subject: `Merge branch '${plan.target}' into ${plan.branch}`,
    trailers: decisionTrailers(session, plan.id),
    stage: [],
    receipt: { change: plan.id, kind: "close" },
  });
  const { lang } = session;
  const units = verification.kind === "passed" ? verification.units : undefined;
  const done = units === undefined ? [] : unitsLines(units, lang);
  return { ok: true, lines: [absorbedLine(plan.target, commit, verification, lang), ...done] };
}

/** Nothing moved: the change stays in its phase, its branch and its folder as they were. */
function refused(
  session: Session,
  state: ChangeState,
  reason: string,
  next: string,
  details?: OutputBlock,
): Refused {
  const lead = notYetLine(state.phase, "unchanged", session.lang);
  return { ok: false, output: blocked(state, [lead, reason], details, next) };
}

/**
 * The merge stays in progress in the change's folder, recorded as a pending incorporation that
 * opens to the agent what either side changed since their common base (ARCHITECTURE §9).
 */
async function leaveForAgent(
  session: Session,
  plan: Integration,
  change: StoredChange,
  again: "close" | "accept",
  failure: { readonly reason: string; readonly conflicts: string[]; readonly details: OutputBlock },
): Promise<Refused> {
  const { git } = session;
  const base = await git.output(["merge-base", "HEAD", plan.target]);
  const changed = async (to: string) =>
    lines((await git.run(["diff", "--name-only", base, to])).stdout);
  const paths = [...new Set([...(await changed("HEAD")), ...(await changed(plan.target))])]
    .filter((path) => !path.startsWith(".specty/"))
    .toSorted();
  const commit = await git.output(["rev-parse", plan.target]);
  const reason = failure.conflicts.length > 0 ? "conflicts" : "verify";
  const { state } = change;
  const at = session.environment.now().toISOString();
  const integration = {
    target: plan.target,
    commit,
    reason,
    conflicts: failure.conflicts,
    paths,
    at,
  } as const;
  await commitState(
    session,
    change,
    { ...state, integration },
    "integration.started",
    { target: plan.target, commit, reason, conflicts: failure.conflicts },
    "specty",
  );
  const lead = notYetLine(state.phase, "waiting", session.lang);
  const next = resolveIncorporationNext(again, session.cards);
  return { ok: false, output: blocked(state, [lead, failure.reason], failure.details, next) };
}

export function blocked(
  state: ChangeState,
  lines: readonly string[],
  details: OutputBlock | undefined,
  next: string,
): Output {
  const blocks = section(undefined, lines);
  const header = headerOf(state.id, state.phase);
  return {
    status: "blocked",
    header,
    blocks: details === undefined ? blocks : [...blocks, details],
    next,
  };
}

/** True when the main branch already contains the change's branch. */
export function isIncorporated(session: Session, plan: Integration): Promise<boolean> {
  return contains(session.git, plan.target, plan.branch);
}

/** True when `commit` already contains `ancestor`. */
export async function contains(git: Git, commit: string, ancestor: string): Promise<boolean> {
  return (await git.run(["merge-base", "--is-ancestor", ancestor, commit])).code === 0;
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}

/** The last line git or the command printed, to say why it failed. */
export function reasonOf(result: ExecResult): string {
  return tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`;
}
