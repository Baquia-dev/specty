// SPDX-License-Identifier: Apache-2.0
import {
  type Analysis,
  approvalPostponedCard,
  approvalSummary,
  approveSpecQuestion,
  askAgentNext,
  assumptionChoices,
  blockedCard,
  type ChangeState,
  decisionCard,
  headerOf,
  noActiveChangeCard,
  nothingPendingCard,
  notInteractiveCard,
  type Output,
  parseSpec,
  recommendEffort,
  rejectedAssumptionsLine,
  rejectionQuestion,
  revisionLabel,
  type Spec,
  shortHash,
  specApprovedLine,
  specChangedCard,
  specDelta,
  specHash,
  testsFirst,
  transition,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { analyzeChange } from "../flow/analysis";
import { commitWithReceipt, decisionTrailers } from "../flow/commits";
import { finishRetro } from "../flow/finish";
import { listed, sharedFiles, sharedLines } from "../flow/shared";
import type { Session } from "../session";
import { readRevision, readSpec, type StoredChange } from "../store/changes";
import { canDecide } from "./human";
import { thenNext } from "./next";
import { retroDone } from "./retro";
import { decideScope } from "./scope-decision";

/** `specty approve [--scope S]`: a person approves the spec in review or a scope request. */
export async function approve(session: Session, scope: string | undefined): Promise<Output> {
  const { cards } = session;
  if (!canDecide(session)) return notInteractiveCard("approve", cards);
  const active = await resolveActive(session);
  if (active === undefined) return noActiveChangeCard("person", cards);
  if (scope !== undefined) return decideScope(session, active, scope, "approve", undefined);
  if (active.state.phase !== "review")
    return nothingPendingCard(active.state.id, active.state.phase, "approve", cards);
  return approveSpec(session, active);
}

async function approveSpec(session: Session, active: StoredChange): Promise<Output> {
  const { cards } = session;
  const { state, files } = active;
  const header = headerOf(state.id, "review", revisionLabel(state.revision, session.lang));
  const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
  const last = await readRevision(files, state.revision);
  if (last === undefined || specHash(parseSpec(last).spec) !== specHash(spec)) {
    return specChangedCard(header, cards);
  }
  const analysis = await analyzeChange(session, active, "review");
  await noteApprovalSummary(session, active, spec, analysis);
  const items = await decideAssumptions(session, spec, state.items);
  if (items === undefined) return approvalPostponedCard(header, cards);
  const rejected = Object.entries(items)
    .filter(([, item]) => item.decision === "rejected")
    .map(([id]) => id);
  if (rejected.length > 0) {
    await commitState(
      session,
      active,
      { ...state, items },
      "assumption.decided",
      { rejected },
      "human",
    );
    return thenNext(
      session,
      decisionCard(header, [rejectedAssumptionsLine(rejected, session.lang)], cards),
    );
  }
  const question = approveSpecQuestion(state.revision, spec.title, session.lang);
  if (!(await session.environment.terminal.confirm(question))) {
    return approvalPostponedCard(header, cards);
  }
  return approved(session, active, spec, analysis, items, header);
}

/** What the person approves: the spec's path, revision, size, effort, delta, warnings and shared files. */
async function noteApprovalSummary(
  session: Session,
  active: StoredChange,
  spec: Spec,
  analysis: Analysis,
): Promise<void> {
  const { state, files } = active;
  const shared = await sharedFiles(session, state.id, listed(spec));
  const approvedText = await readRevision(files, state.approved?.revision);
  const delta =
    approvedText === undefined ? [] : specDelta(parseSpec(approvedText).spec, spec).entries;
  session.environment.terminal.note(
    spec.title,
    approvalSummary(
      {
        specPath: session.paths.relative(files.spec),
        revision: state.revision,
        size: analysis.size,
        effort: recommendEffort(analysis.size.level, analysis.spec),
        delta,
        diagnostics: analysis.diagnostics,
        shared: sharedLines(session, shared),
      },
      session.cards,
    ),
  );
}

/**
 * The person's decision on each high-impact assumption not confirmed yet, or undefined when they
 * left without deciding. In delegated mode the agent decides for the person: it confirms what it
 * wrote.
 */
async function decideAssumptions(
  session: Session,
  spec: Spec,
  current: ChangeState["items"],
): Promise<ChangeState["items"] | undefined> {
  const items: ChangeState["items"] = { ...current };
  for (const assumption of (spec.sections.assumptions?.items ?? []).filter(
    (item) => item.impact === "high",
  )) {
    const item = items[assumption.id];
    if (item === undefined || item.decision === "confirmed") continue;
    const decided = await decideAssumption(session, `${assumption.id}: ${assumption.text}`, item);
    if (decided === undefined) return undefined;
    items[assumption.id] = decided;
  }
  return items;
}

async function decideAssumption(
  session: Session,
  label: string,
  item: ChangeState["items"][string],
): Promise<ChangeState["items"][string] | undefined> {
  const { terminal } = session.environment;
  const choice =
    session.actor === "agent"
      ? "confirm"
      : await terminal.choose(label, assumptionChoices(session.lang));
  if (choice === undefined) return undefined;
  const comment =
    choice === "reject"
      ? await terminal.ask(rejectionQuestion("assumption", session.lang))
      : undefined;
  return {
    hash: item.hash,
    decision: choice === "reject" ? "rejected" : "confirmed",
    ...(comment !== undefined && comment.trim().length > 0 ? { comment: comment.trim() } : {}),
  };
}

/** The spec approved: its state records who, when and how, and its revision is committed. */
async function approved(
  session: Session,
  active: StoredChange,
  spec: Spec,
  analysis: Analysis,
  items: ChangeState["items"],
  header: string,
): Promise<Output> {
  const { state } = active;
  // Counted as `task done` counts them: with none left, the change goes to acceptance.
  const remainingTasks = (spec.sections.tasks?.items ?? []).filter(
    (item) => state.tasks[item.id]?.status !== "done",
  ).length;
  const moved = transition({
    phase: "review",
    kind: state.kind,
    actor: "human",
    event: {
      type: "approve",
      validationErrors: analysis.valid ? 0 : 1,
      pendingHighImpact: 0,
      remainingTasks,
      testsFirst: testsFirst(spec, session.config.policy.tests),
    },
  });
  if (!moved.ok) return blockedCard(header, moved.code, askAgentNext(session.cards));
  // The person who delegated stays as `by`; the channel records that the agent approved.
  const channel =
    session.actor === "agent" ? "delegated" : (session.environment.terminal.channel ?? "tty");
  const approvedState: ChangeState = {
    ...state,
    phase: moved.phase,
    items: Object.fromEntries(
      Object.entries(items).map(([id, item]) => [
        id,
        item.decision === "pending" ? { ...item, decision: "implicit" as const } : item,
      ]),
    ),
    approved: {
      revision: state.revision,
      hash: analysis.hash,
      at: session.environment.now().toISOString(),
      by: (await session.git.config("user.name")) ?? "unknown",
      channel,
    },
    pending: { ...state.pending, adjustment: null },
  };
  return recordApproval(session, active, spec, analysis, approvedState, channel);
}

async function recordApproval(
  session: Session,
  active: StoredChange,
  spec: Spec,
  analysis: Analysis,
  approvedState: ChangeState,
  channel: string,
): Promise<Output> {
  const { state, files } = active;
  const updated = await commitState(
    session,
    active,
    approvedState,
    "spec.approved",
    { revision: state.revision, hash: analysis.hash, channel },
    "human",
  );
  if (state.kind === "retro")
    return retroDone(session, await finishRetro(session, updated, approvedState));
  const commit = await commitWithReceipt(session, {
    subject: `docs(spec): ${spec.title}`,
    trailers: decisionTrailers(session, state.id, {
      "Specty-Spec": `r${state.revision}@${shortHash(analysis.hash)}`,
    }),
    stage: [[session.paths.relative(files.dir)]],
    only: [session.paths.relative(files.dir)],
    receipt: { change: state.id, kind: "spec" },
  });
  return thenNext(
    session,
    decisionCard(
      headerOf(state.id, approvedState.phase),
      [specApprovedLine(state.revision, commit, session.lang)],
      session.cards,
    ),
  );
}
