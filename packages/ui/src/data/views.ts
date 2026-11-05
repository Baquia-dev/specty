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
import { findingsOf } from "./findings";
import { historyOf } from "./history";
import { lockedOf } from "./locks";
import { type AuditRecord, progressOf } from "./progress";
import type {
  ChangeRecord,
  ChangeTab,
  ChangeView,
  DecisionKind,
  ReviewRecord,
  ReviewView,
} from "./records";
import { deriveReview } from "./review";
import { sharedFiles } from "./shared";
import { testsOf } from "./tests";
import { warningsOf } from "./warnings";

const TABS: Readonly<Record<Phase, ChangeTab>> = {
  draft: "spec",
  review: "spec",
  testing: "progress",
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
  if (state.phase === "testing" && state.testsSubmittedAt !== undefined) return "tests";
  if (state.phase === "implementing" && state.pending.scopeRequests.length > 0) return "scope";
  if (state.phase === "acceptance") return "acceptance";
  if (state.phase === "closing" && state.closingSubmittedAt !== undefined) return "closing";
  return undefined;
}

/**
 * The changes the person asked for on the revision in review, while the agent owes the next one:
 * the last proposal or request in the audit is a request, as `specty next` reads it.
 */
function changesRequestedOf(
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
function highImpactPending(spec: Spec, state: ChangeState): number {
  return (spec.sections.assumptions?.items ?? []).filter((assumption) => {
    if (assumption.impact !== "high") return false;
    const decision = state.items[assumption.id]?.decision;
    return decision === undefined || decision === "pending";
  }).length;
}

export function deriveView(record: ChangeRecord): ChangeView {
  const { state, spec, problems } = parseRecord(record);
  const size = computeSize(spec, DEFAULT_CONFIG);
  const level = state.size?.level ?? size.level;
  const tasks = spec.sections.tasks?.items ?? [];
  const audit = record.audit ?? [];
  const requested = changesRequestedOf(state, audit);
  const decision = requested === undefined ? decisionOf(state) : undefined;
  return {
    ...identityOf(record, state, spec, audit),
    ...slicesIn(spec),
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
    scopeRequests: state.pending.scopeRequests.map(({ id, task, paths, reason }) => ({
      id,
      task,
      paths,
      reason,
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

function identityOf(
  record: ChangeRecord,
  state: ChangeState,
  spec: Spec,
  audit: readonly AuditRecord[],
): Pick<
  ChangeView,
  | "id"
  | "title"
  | "kind"
  | "epic"
  | "phase"
  | "revision"
  | "approved"
  | "branch"
  | "folder"
  | "lost"
  | "orphan"
  | "away"
  | "configIssues"
  | "phaseSince"
  | "createdAt"
  | "closedAt"
  | "goal"
> {
  return {
    id: state.id,
    title: spec.title || state.id,
    kind: state.kind,
    ...epicIn(spec),
    phase: state.phase,
    revision: state.revision,
    ...approvedIn(state),
    ...(state.branch === undefined ? {} : { branch: state.branch }),
    ...(record.folder === undefined ? {} : { folder: record.folder }),
    ...(record.lost === true ? { lost: true } : {}),
    ...(record.orphan === true ? { orphan: true } : {}),
    ...(record.away === undefined ? {} : { away: record.away }),
    ...(record.configIssues === undefined ? {} : { configIssues: record.configIssues }),
    phaseSince: record.phaseSince,
    ...timestampsOf(record, state, audit),
    goal: spec.sections.goal ?? spec.sections.reason ?? "",
  };
}

const FINISH_EVENTS = [
  "change.closed",
  "change.cancelled",
  "retro.confirmed",
  "change.accepted",
] as const;

function timestampsOf(
  record: ChangeRecord,
  state: ChangeState,
  audit: readonly AuditRecord[],
): Pick<ChangeView, "createdAt"> & Partial<Pick<ChangeView, "closedAt">> {
  const createdAt =
    audit.find((entry) => entry.event === "change.created")?.ts ??
    audit[0]?.ts ??
    record.phaseSince;
  if (state.phase !== "done" && state.phase !== "cancelled") {
    return { createdAt };
  }
  const closedAt =
    audit.findLast((entry) => FINISH_EVENTS.includes(entry.event as (typeof FINISH_EVENTS)[number]))
      ?.ts ?? record.phaseSince;
  return { createdAt, closedAt };
}

function epicIn(spec: Spec): Pick<ChangeView, "epic"> {
  const { epic, slice } = spec.frontmatter;
  if (epic === undefined) return {};
  return { epic: { id: epic, title: epic, ...(slice === undefined ? {} : { slice }) } };
}

/** An epic's slices, by id and title; nothing without a Cortes section or with none in it. */
function slicesIn(spec: Spec): Pick<ChangeView, "slices"> {
  const slices = spec.sections.slices?.items ?? [];
  if (slices.length === 0) return {};
  return { slices: slices.map(({ id, title }) => ({ id, title })) };
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
