// SPDX-License-Identifier: Apache-2.0
// Derives what the screens show from the raw records, with core. Loaded only by the derivation
// worker, or on demand where there are no workers: it carries core's parser, zod and yaml.
import {
  type ChangeState,
  computeSize,
  DEFAULT_CONFIG,
  formatSizeReason,
  type Phase,
  parseChangeState,
  parseSpec,
  recommendEffort,
  type Spec,
} from "@baquia-dev/specty-core";
import { requestOf } from "./asked";
import { closingOf } from "./closing";
import { deriveDelta } from "./delta";
import { historyOf } from "./history";
import { type AuditRecord, progressOf } from "./progress";
import type { ChangeRecord, ChangeTab, ChangeView, DecisionKind, ReviewView } from "./records";
import { deriveReview } from "./review";
import { sharedFiles } from "./shared";

const TABS: Readonly<Record<Phase, ChangeTab>> = {
  draft: "spec",
  review: "spec",
  implementing: "progress",
  adjusting: "progress",
  acceptance: "acceptance",
  closing: "acceptance",
  done: "history",
  cancelled: "history",
};

export function initialTab(phase: Phase): ChangeTab {
  return TABS[phase];
}

/** What the person has to decide now, if anything (docs/ui.md, Bandeja). */
export function decisionOf(state: ChangeState): DecisionKind | undefined {
  if (state.phase === "review") return "review";
  if (state.phase === "implementing" && state.pending.scopeRequests.length > 0) return "scope";
  if (state.phase === "acceptance") return "acceptance";
  if (state.phase === "closing" && state.closingSubmittedAt !== undefined) return "closing";
  return undefined;
}

/**
 * The changes the person asked for on the revision in review, while the agent owes the next one:
 * the last proposal or request in the audit is a request, as `specty next` reads it.
 */
export function changesRequestedOf(
  state: ChangeState,
  audit: readonly AuditRecord[],
): ChangeView["changesRequested"] {
  if (state.phase !== "review") return undefined;
  const last = audit.findLast(
    (entry) => entry.event === "spec.proposed" || entry.event === "review.changes_requested",
  );
  if (last?.event !== "review.changes_requested") return undefined;
  const { revision } = last.data;
  return { revision: typeof revision === "number" ? revision : state.revision, at: last.ts };
}

/** High-impact assumptions without a decision of the person. */
export function highImpactPending(spec: Spec, state: ChangeState): number {
  return (spec.sections.assumptions?.items ?? []).filter((assumption) => {
    if (assumption.impact !== "high") return false;
    const decision = state.items[assumption.id]?.decision;
    return decision === undefined || decision === "pending";
  }).length;
}

export function deriveView(record: ChangeRecord): ChangeView {
  const checked = parseChangeState(record.state);
  const state = checked.ok ? checked.state : record.state;
  const parsed = parseSpec(record.spec);
  const { spec } = parsed;
  const problems = [
    ...(checked.ok ? [] : checked.issues.map((issue) => `state.json: ${issue}`)),
    ...parsed.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `spec.md: ${diagnostic.message}`),
  ];
  const size = computeSize(spec, DEFAULT_CONFIG);
  const level = state.size?.level ?? size.level;
  const tasks = spec.sections.tasks?.items ?? [];
  const requested = changesRequestedOf(state, record.audit ?? []);
  const request = requestOf(record.audit ?? []);
  // Once the person asked for changes, the change waits for the agent, not for them.
  const decision = requested === undefined ? decisionOf(state) : undefined;
  return {
    id: state.id,
    title: spec.title || state.id,
    kind: state.kind,
    phase: state.phase,
    revision: state.revision,
    ...(state.approved === undefined
      ? {}
      : {
          approved: {
            revision: state.approved.revision,
            at: state.approved.at,
            by: state.approved.by,
            ...(state.approved.channel === "delegated" ? { delegated: true } : {}),
          },
        }),
    ...(state.branch === undefined ? {} : { branch: state.branch }),
    ...(record.folder === undefined ? {} : { folder: record.folder }),
    phaseSince: record.phaseSince,
    goal: spec.sections.goal ?? spec.sections.reason ?? "",
    ...(request === undefined ? {} : { request }),
    size: {
      level,
      reasons: size.reasons.map((reason) => ({
        es: formatSizeReason(reason, "es"),
        en: formatSizeReason(reason, "en"),
      })),
    },
    effort: recommendEffort(level),
    ...(decision === undefined ? {} : { decision }),
    ...(requested === undefined ? {} : { changesRequested: requested }),
    highImpactPending: state.phase === "review" ? highImpactPending(spec, state) : 0,
    scopeRequests: state.pending.scopeRequests.map((request) => ({
      id: request.id,
      task: request.task,
      paths: request.paths,
      reason: request.reason,
    })),
    tasks: {
      done: tasks.filter((task) => state.tasks[task.id]?.status === "done").length,
      total: tasks.length,
    },
    tab: initialTab(state.phase),
    problems,
    review: {
      ...deriveReview(spec, state, record.comments ?? []),
      ...deltaOf(record, state, spec),
    },
    progress: progressOf(spec, state, record.audit ?? [], record.verifyFull),
    ...closingIn(spec),
    history: historyOf(record.audit ?? []),
  };
}

/** The closing the agent wrote, in its parts; nothing while the section is missing or empty. */
function closingIn(spec: Spec): Pick<ChangeView, "closing"> {
  const text = spec.sections.closing?.trim() ?? "";
  return text === "" ? {} : { closing: closingOf(text) };
}

/** In review, what changed since the approved revision, if there was one. */
function deltaOf(record: ChangeRecord, state: ChangeState, spec: Spec): Partial<ReviewView> {
  if (state.phase !== "review" || state.approved === undefined) return {};
  if (record.approvedSpec === undefined) return {};
  const approved = parseSpec(record.approvedSpec).spec;
  return { delta: deriveDelta(spec, approved, state.approved.revision) };
}

/** Every change's view, each with the files it shares with the other open changes. */
export function deriveViews(records: readonly ChangeRecord[]): readonly ChangeView[] {
  const shared = sharedFiles(records);
  return records.map((record) => {
    const view = deriveView(record);
    const mine = shared.get(view.id);
    return mine === undefined ? view : { ...view, shared: mine };
  });
}
