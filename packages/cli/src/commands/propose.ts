// SPDX-License-Identifier: Apache-2.0
import {
  type Analysis,
  blockedCard,
  type ChangeState,
  closingInAcceptance,
  duplicateApproveNext,
  duplicateFilesBlock,
  type EffortRecommendation,
  foreignFrontsBlock,
  formatSizeReason,
  headerOf,
  invalidSpecCard,
  itemHashes,
  type Lang,
  nextCard,
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
  SIZE_LEVELS,
  type SizeResult,
  type Spec,
  specDelta,
  specHash,
  transition,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { analyzeChange } from "../flow/analysis";
import { dataOf, readAudit } from "../flow/carried";
import { impactBlock, impactedFiles } from "../flow/impact";
import { duplicatedBy, foreignFronts, listed, sharedBlock, sharedFiles } from "../flow/shared";
import { changeView } from "../flow/views";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readRevision, type StoredChange } from "../store/changes";
import { resolveComments } from "../store/comments";
import { proposeTests } from "./tests";

const PROPOSE_PHASES: readonly ProposePhase[] = ["draft", "review", "adjusting", "closing"];

/** `specty propose`: validates the spec, writes its canonical form and sends it to review. */
export async function propose(session: Session): Promise<Output> {
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined) return noActiveChangeCard("agent", cards);
  const { state, files } = active;
  // In the testing phase, what is sent is the tests, not the spec (ADR 0014).
  if (state.phase === "testing") return proposeTests(session, active);
  const phase = proposalOf(session, state);
  if (phase === undefined) return notProposableCard(state.id, state.phase, cards);
  const analysis = await analyzeChange(session, active, phase);
  if (!analysis.valid) {
    const specPath = session.paths.relative(files.spec);
    return invalidSpecCard(headerOf(state.id, state.phase), specPath, analysis.diagnostics, cards);
  }
  // A draft never approved takes the frontmatter's kind (validated above): a too-large standard
  // becomes an epic in place, keeping its request and what it resolves.
  const { kind } = analysis.spec.frontmatter;
  const moved = transition({
    phase: state.phase,
    kind,
    actor: session.actor,
    event: { type: "propose", validationErrors: 0 },
  });
  if (!moved.ok) return blockedCard(headerOf(state.id, state.phase), moved.code, runNext(cards));
  const proposed = await recordProposal(session, active, analysis, phase, moved.phase);
  const { revision } = proposed.state;
  const card = await proposalCard(session, active, analysis, {
    phase,
    moved: moved.phase,
    revision,
  });
  // The closing sent in acceptance goes on as the acceptance says: its `accept` closes the change.
  if (state.phase !== "acceptance") return card;
  const view = await changeView(session, proposed);
  return { ...card, next: nextCard({ change: view, dirty: [] }, cards).next };
}

/**
 * What the change's phase proposes: its spec, or its closing; in acceptance, in delegated mode,
 * the closing sent ahead of the acceptance (`closingInAcceptance`), checked as a closing.
 */
function proposalOf(session: Session, state: ChangeState): ProposePhase | undefined {
  if (state.phase === "acceptance")
    return closingInAcceptance(state.kind, session.delegated) ? "closing" : undefined;
  return PROPOSE_PHASES.find((candidate) => candidate === state.phase);
}

/**
 * Writes the spec in its canonical form and, when it changed, a new revision that answers the
 * comments still open; the state records it. Returns the change as it is now.
 */
async function recordProposal(
  session: Session,
  active: StoredChange,
  analysis: Analysis,
  phase: ProposePhase,
  moved: Phase,
): Promise<StoredChange> {
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
  // A new proposal hands the review back to the person (`changeWaitsFor`). Only a closing keeps
  // one sent: an adjustment's proposal drops the one sent ahead of the acceptance.
  const { changesRequestedAt: _requested, closingSubmittedAt: _sent, ...rest } = state;
  const nextState: ChangeState = {
    ...rest,
    kind: analysis.spec.frontmatter.kind,
    phase: moved,
    revision,
    items: decisions(state, analysis.spec),
    maxIds: maxIdsOf(state, analysis.spec),
    size,
    ...(phase === "closing" ? { closingSubmittedAt: now } : {}),
  };
  return commitState(session, active, nextState, "spec.proposed", {
    revision,
    hash: analysis.hash,
    size: size.level,
    warnings: analysis.diagnostics.length,
    ...(nextState.kind === state.kind ? {} : { kind: nextState.kind, previousKind: state.kind }),
  });
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
  const effort = recommendEffort(analysis.size.level, analysis.spec, session.config.effort);
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
  return withParallel(session, active, analysis, card);
}

/**
 * The proposed spec next to the other open changes: the files it shares, the changes it may
 * duplicate (in delegated mode, the user decides before the approval) and the files outside it
 * that import what it changes, a scope request foreseen.
 */
async function withParallel(
  session: Session,
  active: StoredChange,
  analysis: Analysis,
  card: Output,
): Promise<Output> {
  const paths = listed(analysis.spec);
  const shared = await sharedFiles(session, active.state.id, paths);
  const created = dataOf(
    (await readAudit(active.files)).find((entry) => entry.event === "change.created"),
  );
  const apart = Array.isArray(created.distinctFrom) ? created.distinctFrom.map(String) : [];
  const duplicates = await duplicatedBy(session, paths, shared, new Set(apart));
  const impacts = await impactedFiles(session, analysis.spec);
  const blocks = [
    ...sharedBlock(session, shared),
    ...foreignFrontsBlock(await foreignFronts(session, paths), session.cards),
    ...duplicateFilesBlock(duplicates, session.cards),
    ...impactBlock(session, impacts),
  ];
  const ids = duplicates.map(({ change }) => change.id);
  const next =
    ids.length > 0 && session.delegated ? duplicateApproveNext(ids, session.cards) : card.next;
  return { ...card, blocks: [...card.blocks, ...blocks], next };
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
 * An independent review (ADR 0011) comes before the approval of a spec from the size
 * `flow.reviewFrom` (L by default), a sensitive one or one whose review effort is `max`, once per
 * change, when the person set one up; a failed one counts, so reviews never chain.
 */
async function reviewRecommended(
  session: Session,
  change: StoredChange,
  size: SizeResult,
  effort: EffortRecommendation,
  phase: ProposePhase,
): Promise<boolean> {
  if (session.config.review === undefined || phase === "closing") return false;
  const from = SIZE_LEVELS.indexOf(session.config.flow.reviewFrom);
  const large = SIZE_LEVELS.indexOf(size.level) >= from || size.signals.sensitive.length > 0;
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
