// SPDX-License-Identifier: Apache-2.0
// Derives what the screens show from the raw records, with core. Loaded only by the derivation
// worker, or on demand where there are no workers: it carries core's parser, zod and yaml.
import {
  type ChangeState,
  type ChangeSummary as CoreChangeSummary,
  changeWaitsFor,
  parseChangeState,
  parseSpec,
  recommendEffort,
  type Spec,
  summarizeChange,
} from "@baquia-dev/specty-core";
import { requestOf } from "./asked";
import { closingOf } from "./closing";
import { deriveDelta } from "./delta";
import { findingsOf } from "./findings";
import { historyOf } from "./history";
import { lockedOf } from "./locks";
import { type AuditRecord, progressOf } from "./progress";
import type { ChangeRecord, ChangeView, DecisionKind, ReviewRecord, ReviewView } from "./records";
import { deriveReview } from "./review";
import { sharedFiles } from "./shared";
import { testsOf } from "./tests";
import { warningsOf } from "./warnings";

/** The tab a change opens on, by phase: core's rule, the same the local server summarizes with. */
export { initialTab } from "@baquia-dev/specty-core";

/**
 * What the person has to decide now, if anything (docs/ui.md, Bandeja). The review, only while
 * it is theirs (`changeWaitsFor`): not once they sent it back.
 */
export function decisionOf(state: ChangeState): DecisionKind | undefined {
  if (state.phase === "review") return changeWaitsFor(state) === "human" ? "review" : undefined;
  if (state.phase === "testing" && state.testsSubmittedAt !== undefined) return "tests";
  if (state.phase === "implementing" && state.pending.scopeRequests.length > 0) return "scope";
  if (state.phase === "acceptance") return "acceptance";
  if (state.phase === "closing" && state.closingSubmittedAt !== undefined) return "closing";
  return undefined;
}

/**
 * The changes the person asked for on the revision in review, while the agent owes the next one:
 * `changesRequestedAt` in the state, as `specty next` and `specty wait` read it. The revision is
 * the one in review, since only the next proposal raises it, and that proposal clears the field.
 */
function changesRequestedOf(state: ChangeState): ChangeView["changesRequested"] {
  if (state.phase !== "review" || state.changesRequestedAt === undefined) return undefined;
  return { revision: state.revision, at: state.changesRequestedAt };
}

/** High-impact assumptions without a decision of the person. */
function highImpactPending(spec: Spec, state: ChangeState): number {
  return (spec.sections.assumptions?.items ?? []).filter((assumption) => {
    if (assumption.impact !== "high") return false;
    const decision = state.items[assumption.id]?.decision;
    return decision === undefined || decision === "pending";
  }).length;
}

export function deriveView(record: ChangeRecord): ChangeView {
  const { state, spec, problems } = parseRecord(record);
  const audit = record.audit ?? [];
  const summary = summarizeChange({ spec, state, phaseSince: record.phaseSince, audit });
  const requested = changesRequestedOf(state);
  const decision = decisionOf(state);
  return {
    ...identityOf(record, state, spec, summary),
    effort: recommendEffort(summary.size.level),
    ...(decision === undefined ? {} : { decision }),
    ...(requested === undefined ? {} : { changesRequested: requested }),
    highImpactPending: state.phase === "review" ? highImpactPending(spec, state) : 0,
    scopeRequests: state.pending.scopeRequests.map(({ id, task, paths, reason }) => ({
      id,
      task,
      paths,
      reason,
    })),
    problems,
    review: {
      ...deriveReview(spec, state, record.comments ?? []),
      ...deltaOf(record, state, spec),
    },
    progress: progressOf(spec, state, audit, record.verifyFull),
    ...closingIn(spec),
    ...auditExtrasOf(record, state, audit),
    history: historyOf(audit),
  };
}

function parseRecord(record: ChangeRecord): {
  readonly state: ChangeState;
  readonly spec: Spec;
  readonly problems: readonly string[];
} {
  const checked = parseChangeState(record.state);
  const state = checked.ok ? checked.state : record.state;
  const parsed = parseSpec(record.spec);
  const problems = [
    ...(checked.ok ? [] : checked.issues.map((issue) => `state.json: ${issue}`)),
    ...parsed.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `spec.md: ${diagnostic.message}`),
  ];
  return { state, spec: parsed.spec, problems };
}

/**
 * Who the change is and where it stands: core's summary, with its epic's id as the epic's title
 * until `deriveViews` finds the epic, and what the record says of its revision and its folder.
 */
function identityOf(
  record: ChangeRecord,
  state: ChangeState,
  spec: Spec,
  summary: CoreChangeSummary,
): Pick<
  ChangeView,
  | "id"
  | "title"
  | "kind"
  | "epic"
  | "slices"
  | "phase"
  | "revision"
  | "approved"
  | "branch"
  | "folder"
  | "lost"
  | "holder"
  | "orphan"
  | "away"
  | "unattended"
  | "configIssues"
  | "phaseSince"
  | "createdAt"
  | "closedAt"
  | "goal"
  | "size"
  | "tasks"
  | "tab"
> {
  const { epic, ...listed } = summary;
  return {
    ...listed,
    ...(epic === undefined ? {} : { epic: { ...epic, title: epic.id } }),
    revision: state.revision,
    ...approvedIn(state),
    ...(state.branch === undefined ? {} : { branch: state.branch }),
    ...(record.folder === undefined ? {} : { folder: record.folder }),
    ...(record.lost === true ? { lost: true } : {}),
    ...holdsOf(record),
    ...(record.configIssues === undefined ? {} : { configIssues: record.configIssues }),
    goal: spec.sections.goal ?? spec.sections.reason ?? "",
  };
}

/**
 * Who holds it, as the server says: the agent that stepped last in its folder, nobody (an
 * orphan), its conversation from another folder, or nobody picks up the person's last decision.
 */
function holdsOf(
  record: ChangeRecord,
): Pick<ChangeView, "holder" | "orphan" | "away" | "unattended"> {
  return {
    ...(record.holder === undefined ? {} : { holder: record.holder }),
    ...(record.orphan === true ? { orphan: true } : {}),
    ...(record.away === undefined ? {} : { away: record.away }),
    ...(record.unattended === undefined ? {} : { unattended: record.unattended }),
  };
}

function approvedIn(state: ChangeState): Pick<ChangeView, "approved"> {
  const { approved } = state;
  if (approved === undefined) return {};
  return {
    approved: {
      revision: approved.revision,
      at: approved.at,
      by: approved.by,
      ...(approved.channel === "delegated" ? { delegated: true } : {}),
    },
  };
}

function auditExtrasOf(
  record: ChangeRecord,
  state: ChangeState,
  audit: readonly AuditRecord[],
): Partial<ChangeView> {
  const request = requestOf(audit);
  const warnings = warningsOf(audit);
  const findings = findingsOf(audit);
  const tests = testsOf(state, audit);
  const locked = lockedOf(state, audit);
  return {
    ...(request === undefined ? {} : { request }),
    ...(tests === undefined ? {} : { tests }),
    ...(locked.length === 0 ? {} : { lockedTests: locked }),
    ...(record.criteriaTests === undefined ? {} : { criteriaTests: record.criteriaTests }),
    ...(record.withoutClosing === true ? { withoutClosing: true } : {}),
    ...(warnings.length === 0 ? {} : { warnings }),
    ...(findings.length === 0 ? {} : { findings }),
    ...reviewsIn(record),
  };
}

function reviewsIn(record: ChangeRecord): Pick<ChangeView, "specReview" | "resultReview"> {
  const last = (target: ReviewRecord["target"]) =>
    (record.reviews ?? []).findLast((review) => review.target === target);
  const specReview = last("spec");
  const resultReview = last("diff");
  return {
    ...(specReview === undefined ? {} : { specReview }),
    ...(resultReview === undefined ? {} : { resultReview }),
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

/**
 * Every change's view, each with the files it shares with the other open changes; a slice, with
 * the title of its epic and the one the epic gives the slice.
 */
export function deriveViews(records: readonly ChangeRecord[]): readonly ChangeView[] {
  const shared = sharedFiles(records);
  const views = records.map((record) => deriveView(record));
  const byId = new Map(views.map((view) => [view.id, view]));
  return views.map((view) => {
    const mine = shared.get(view.id);
    const epic = view.epic === undefined ? undefined : epicOf(view.epic, byId.get(view.epic.id));
    return {
      ...view,
      ...(mine === undefined ? {} : { shared: mine }),
      ...(epic === undefined ? {} : { epic }),
    };
  });
}

/** A slice's epic, with the title of the epic when it is loaded and the one it gives the slice. */
function epicOf(
  epic: NonNullable<ChangeView["epic"]>,
  loaded: ChangeView | undefined,
): NonNullable<ChangeView["epic"]> {
  const sliceTitle = loaded?.slices?.find((slice) => slice.id === epic.slice)?.title;
  return {
    ...epic,
    title: loaded?.title ?? epic.title,
    ...(sliceTitle === undefined ? {} : { sliceTitle }),
  };
}
