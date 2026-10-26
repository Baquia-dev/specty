// SPDX-License-Identifier: Apache-2.0
import {
  type Analysis,
  blockedCard,
  type ChangeState,
  type EffortRecommendation,
  formatSizeReason,
  headerOf,
  invalidSpecCard,
  itemHashes,
  type Lang,
  noActiveChangeCard,
  notProposableCard,
  type Output,
  type Phase,
  type ProposePhase,
  parseItemId,
  parseSpec,
  proposedCard,
  recommendEffort,
  revisionLabel,
  runNext,
  type SizeResult,
  type Spec,
  specDelta,
  specHash,
  transition,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { analyzeChange } from "../flow/analysis";
import { dataOf, readAudit } from "../flow/carried";
import { listed, sharedBlock, sharedFiles } from "../flow/shared";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readRevision, type StoredChange } from "../store/changes";
import { resolveComments } from "../store/comments";

const PROPOSE_PHASES: readonly ProposePhase[] = ["draft", "review", "adjusting", "closing"];

/** `specty propose`: validates the spec, writes its canonical form and sends it to review. */
export async function propose(session: Session): Promise<Output> {
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined) return noActiveChangeCard("agent", cards);
  const { state, files } = active;
  const phase = PROPOSE_PHASES.find((candidate) => candidate === state.phase);
  if (phase === undefined) return notProposableCard(state.id, state.phase, cards);
  const analysis = await analyzeChange(session, active, phase);
  if (!analysis.valid) {
    const specPath = session.paths.relative(files.spec);
    return invalidSpecCard(headerOf(state.id, phase), specPath, analysis.diagnostics, cards);
  }
  const moved = transition({
    phase,
    kind: state.kind,
    actor: session.actor,
    event: { type: "propose", validationErrors: 0 },
  });
  if (!moved.ok) return blockedCard(headerOf(state.id, phase), moved.code, runNext(cards));
  const revision = await recordProposal(session, active, analysis, phase, moved.phase);
  return proposalCard(session, active, analysis, { phase, moved: moved.phase, revision });
}

/**
 * Writes the spec in its canonical form and, when it changed, a new revision that answers the
 * comments still open; the state records it. Returns the revision.
 */
async function recordProposal(
  session: Session,
  active: StoredChange,
  analysis: Analysis,
  phase: ProposePhase,
  moved: Phase,
): Promise<number> {
  const { state, files } = active;
  const lastText = await readRevision(files, state.revision);
  const unchanged =
    lastText !== undefined &&
    specHash(parseSpec(lastText).spec) === analysis.hash &&
    moved === state.phase;
  const revision = unchanged ? state.revision : state.revision + 1;
  await writeText(files.spec, analysis.text);
  if (!unchanged) {
    await writeText(files.revision(revision), analysis.text);
    // The new revision is the agent's answer to the comments still open (formats.md §5).
    await resolveComments(files, revision);
  }
  const now = session.environment.now().toISOString();
  const size = keptSize(state, analysis.size, phase, session.lang);
  const nextState: ChangeState = {
    ...state,
    phase: moved,
    revision,
    items: decisions(state, analysis.spec),
    maxIds: maxIdsOf(state, analysis.spec),
    size,
    ...(phase === "closing" ? { closingSubmittedAt: now } : {}),
  };
  await commitState(session, active, nextState, "spec.proposed", {
    revision,
    hash: analysis.hash,
    size: size.level,
    warnings: analysis.diagnostics.length,
  });
  return revision;
}

/** The proposal's card: size, effort, the changes since the approval, warnings and shared files. */
async function proposalCard(
  session: Session,
  active: StoredChange,
  analysis: Analysis,
  proposal: { readonly phase: ProposePhase; readonly moved: Phase; readonly revision: number },
): Promise<Output> {
  const { state, files } = active;
  const { phase } = proposal;
  const approvedText = await readRevision(files, state.approved?.revision);
  const delta =
    approvedText === undefined || phase === "closing"
      ? []
      : specDelta(parseSpec(approvedText).spec, analysis.spec).entries;
  const effort = recommendEffort(analysis.size.level, analysis.spec);
  const review = await reviewRecommended(session, active, analysis.size, effort, phase);
  const card = proposedCard(
    {
      header: headerOf(state.id, proposal.moved, revisionLabel(proposal.revision, session.lang)),
      specPath: session.paths.relative(files.spec),
      size: analysis.size,
      effort,
      warnings: analysis.diagnostics.filter((entry) => entry.severity === "warning"),
      delta,
      closing: phase === "closing",
      ...(review ? { review } : {}),
    },
    session.cards,
  );
  // Files another open change also lists: seen while planning, not when the merge collides.
  if (phase === "closing") return card;
  const shared = await sharedFiles(session, state.id, listed(analysis.spec));
  return { ...card, blocks: [...card.blocks, ...sharedBlock(session, shared)] };
}

/**
 * The size the state keeps. The closing keeps the approval's: it was decided then, and the closing
 * no longer looks at it, however many files the change's globs match today.
 */
function keptSize(
  state: ChangeState,
  size: SizeResult,
  phase: ProposePhase,
  lang: Lang,
): NonNullable<ChangeState["size"]> {
  if (phase === "closing" && state.size !== undefined) return state.size;
  return {
    level: size.level,
    score: size.score,
    adjust: size.adjust,
    reasons: size.reasons.map((reason) => formatSizeReason(reason, lang)),
  };
}

/**
 * An independent review (ADR 0011) comes before the approval of a large or sensitive spec, or one
 * whose review effort is `max`, once per change, when the person set one up; a failed one counts,
 * so reviews never chain.
 */
async function reviewRecommended(
  session: Session,
  change: StoredChange,
  size: SizeResult,
  effort: EffortRecommendation,
  phase: ProposePhase,
): Promise<boolean> {
  if (session.config.review === undefined || phase === "closing") return false;
  const large = size.level === "L" || size.level === "XL" || size.signals.sensitive.length > 0;
  if (!large && effort.plan !== "max") return false;
  const audit = await readAudit(change.files);
  return !audit.some(
    (entry) => entry.event === "review.completed" && dataOf(entry).target === "spec",
  );
}

/** Keeps confirmations whose text did not change; everything else waits for a person again. */
function decisions(state: ChangeState, spec: Spec): ChangeState["items"] {
  const hashes = itemHashes(spec);
  const entries = (spec.sections.assumptions?.items ?? []).flatMap((item) => {
    const hash = hashes.get(item.id);
    if (hash === undefined) return [];
    const previous = state.items[item.id];
    const kept =
      previous?.hash === hash &&
      (previous.decision === "confirmed" || previous.decision === "implicit");
    return [
      [item.id, { hash, decision: kept ? previous.decision : ("pending" as const) }] as const,
    ];
  });
  return Object.fromEntries(entries);
}

function maxIdsOf(state: ChangeState, spec: Spec): ChangeState["maxIds"] {
  const { sections } = spec;
  const ids = [
    ...(sections.assumptions?.items ?? []),
    ...(sections.criteria?.items ?? []),
    ...(sections.tasks?.items ?? []),
    ...(sections.slices?.items ?? []),
    ...(sections.risks?.items ?? []),
  ].flatMap((item) => {
    const parsed = parseItemId(item.id);
    return parsed === undefined ? [] : [parsed];
  });
  const max: ChangeState["maxIds"] = { ...state.maxIds };
  for (const { prefix, number } of ids) {
    max[prefix] = Math.max(max[prefix] ?? 0, number);
  }
  return max;
}
