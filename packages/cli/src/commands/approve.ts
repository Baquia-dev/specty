// SPDX-License-Identifier: Apache-2.0
import {
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
  shortHash,
  specApprovedLine,
  specChangedCard,
  specDelta,
  specHash,
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
  const { terminal } = session.environment;
  const header = headerOf(state.id, "review", revisionLabel(state.revision, session.lang));
  const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
  const last = await readRevision(files, state.revision);
  if (last === undefined || specHash(parseSpec(last).spec) !== specHash(spec)) {
    return specChangedCard(header, cards);
  }
  const analysis = await analyzeChange(session, active, "review");
  const shared = await sharedFiles(session, state.id, listed(spec));
  const approvedText = await readRevision(files, state.approved?.revision);
  const delta =
    approvedText === undefined ? [] : specDelta(parseSpec(approvedText).spec, spec).entries;
  terminal.note(
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
      cards,
    ),
  );

  const items: ChangeState["items"] = { ...state.items };
  for (const assumption of (spec.sections.assumptions?.items ?? []).filter(
    (item) => item.impact === "high",
  )) {
    const current = items[assumption.id];
    if (current === undefined || current.decision === "confirmed") continue;
    // In delegated mode the agent decides for the person: it confirms what it wrote.
    const choice =
      session.actor === "agent"
        ? "confirm"
        : await terminal.choose(
            `${assumption.id}: ${assumption.text}`,
            assumptionChoices(session.lang),
          );
    if (choice === undefined) return approvalPostponedCard(header, cards);
    const comment =
      choice === "reject"
        ? await terminal.ask(rejectionQuestion("assumption", session.lang))
        : undefined;
    items[assumption.id] = {
      hash: current.hash,
      decision: choice === "reject" ? "rejected" : "confirmed",
      ...(comment !== undefined && comment.trim().length > 0 ? { comment: comment.trim() } : {}),
    };
  }
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
  if (!(await terminal.confirm(approveSpecQuestion(state.revision, spec.title, session.lang)))) {
    return approvalPostponedCard(header, cards);
  }
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
    },
  });
  if (!moved.ok) return blockedCard(header, moved.code, askAgentNext(cards));
  const finalItems = Object.fromEntries(
    Object.entries(items).map(([id, item]) => [
      id,
      item.decision === "pending" ? { ...item, decision: "implicit" as const } : item,
    ]),
  );
  // The person who delegated stays as `by`; the channel records that the agent approved.
  const channel = session.actor === "agent" ? "delegated" : (terminal.channel ?? "tty");
  const approvedState: ChangeState = {
    ...state,
    phase: moved.phase,
    items: finalItems,
    approved: {
      revision: state.revision,
      hash: analysis.hash,
      at: session.environment.now().toISOString(),
      by: (await session.git.config("user.name")) ?? "unknown",
      channel,
    },
    pending: { ...state.pending, adjustment: null },
  };
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
      headerOf(state.id, moved.phase),
      [specApprovedLine(state.revision, commit, session.lang)],
      cards,
    ),
  );
}
