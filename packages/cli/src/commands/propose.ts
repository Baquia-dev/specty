// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangeState,
  formatSizeReason,
  headerOf,
  invalidSpecCard,
  itemHashes,
  type Output,
  type ProposePhase,
  parseItemId,
  parseSpec,
  proposedCard,
  recommendEffort,
  type Spec,
  specDelta,
  specHash,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { analyzeChange } from "../flow/analysis";
import { listed, sharedBlock, sharedFiles } from "../flow/shared";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readRevision } from "../store/changes";

const PROPOSE_PHASES: readonly ProposePhase[] = ["draft", "review", "adjusting", "closing"];

/** `specty propose`: validates the spec, writes its canonical form and sends it to review. */
export async function propose(session: Session): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined) {
    return blockedCard(
      headerOf(),
      t("No hay un cambio activo.", "There is no active change."),
      t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`),
    );
  }
  const { state, files } = active;
  const phase = PROPOSE_PHASES.find((candidate) => candidate === state.phase);
  const specPath = session.paths.relative(files.spec);
  if (phase === undefined) {
    return blockedCard(
      headerOf(state.id, state.phase),
      t(
        `En la fase ${state.phase} la spec no se propone.`,
        `The spec is not proposed in the ${state.phase} phase.`,
      ),
      t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`),
    );
  }
  const analysis = await analyzeChange(session, active, phase);
  if (!analysis.valid) {
    return invalidSpecCard(headerOf(state.id, phase), specPath, analysis.diagnostics, cards);
  }
  const moved = transition({
    phase,
    kind: state.kind,
    actor: session.actor,
    event: { type: "propose", validationErrors: 0 },
  });
  if (!moved.ok) {
    return blockedCard(
      headerOf(state.id, phase),
      moved.code,
      t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`),
    );
  }
  const lastText = await readRevision(files, state.revision);
  const unchanged =
    lastText !== undefined &&
    specHash(parseSpec(lastText).spec) === analysis.hash &&
    moved.phase === state.phase;
  const revision = unchanged ? state.revision : state.revision + 1;
  await writeText(files.spec, analysis.text);
  if (!unchanged) await writeText(files.revision(revision), analysis.text);
  const now = session.environment.now().toISOString();
  const nextState: ChangeState = {
    ...state,
    phase: moved.phase,
    revision,
    items: decisions(state, analysis.spec),
    maxIds: maxIdsOf(state, analysis.spec),
    size: {
      level: analysis.size.level,
      score: analysis.size.score,
      adjust: analysis.size.adjust,
      reasons: analysis.size.reasons.map((reason) => formatSizeReason(reason, session.lang)),
    },
    ...(phase === "closing" ? { closingSubmittedAt: now } : {}),
  };
  await commitState(session, active, nextState, "spec.proposed", {
    revision,
    hash: analysis.hash,
    size: analysis.size.level,
    warnings: analysis.diagnostics.length,
  });
  const approvedText = await readRevision(files, state.approved?.revision);
  const delta =
    approvedText === undefined || phase === "closing"
      ? []
      : specDelta(parseSpec(approvedText).spec, analysis.spec).entries;
  const card = proposedCard(
    {
      header: headerOf(state.id, moved.phase, t(`revisión ${revision}`, `revision ${revision}`)),
      specPath,
      size: analysis.size,
      effort: recommendEffort(analysis.size.level),
      warnings: analysis.diagnostics.filter((entry) => entry.severity === "warning"),
      delta,
      closing: phase === "closing",
    },
    cards,
  );
  // Files another open change also lists: seen while planning, not when the merge collides.
  if (phase === "closing") return card;
  const shared = await sharedFiles(session, state.id, listed(analysis.spec));
  return { ...card, blocks: [...card.blocks, ...sharedBlock(session, shared)] };
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
