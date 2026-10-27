// SPDX-License-Identifier: Apache-2.0
// Derives the spec review with core. Like views.ts, only the derivation worker loads it.
import {
  type ChangeState,
  DEFAULT_CONFIG,
  type Diagnostic,
  isSensitive,
  moduleOf,
  parseItemId,
  type Spec,
  validateSpec,
} from "@baquia-dev/specty-core";
import type {
  AssumptionView,
  Bilingual,
  CommentRecord,
  CommentView,
  FileView,
  ReviewSection,
  ReviewView,
  SectionIndexView,
} from "./records";

const SECTIONS: readonly ReviewSection[] = [
  "goal",
  "outOfScope",
  "assumptions",
  "criteria",
  "files",
  "tasks",
  "risks",
  "design",
];

const SECTION_BY_PREFIX: Readonly<Record<string, ReviewSection>> = {
  A: "assumptions",
  AC: "criteria",
  T: "tasks",
  R: "risks",
};

/** The section an item or a comment anchor belongs to. */
export function sectionOf(anchor: CommentRecord["anchor"]): ReviewSection {
  if ("section" in anchor) return anchor.section;
  const parsed = parseItemId(anchor.item);
  return (parsed && SECTION_BY_PREFIX[parsed.prefix]) || "assumptions";
}

/** A diagnostic of the spec, with its message in both languages. */
interface Found {
  readonly found: Diagnostic;
  readonly text: Bilingual;
}

/** Diagnostics in both languages: the same rules, run once per language, in the same order. */
function diagnostics(spec: Spec): readonly Found[] {
  const context = { phase: "review", config: DEFAULT_CONFIG } as const;
  const es = validateSpec({ ...spec, language: "es" }, context);
  const en = validateSpec({ ...spec, language: "en" }, context);
  return es.map((found, index) => ({
    found,
    text: { es: found.message, en: en[index]?.message ?? found.message },
  }));
}

export function deriveReview(
  spec: Spec,
  state: ChangeState,
  comments: readonly CommentRecord[],
): ReviewView {
  const { sections } = spec;
  const found = diagnostics(spec);
  const warningsFor = (id: string) =>
    found.filter((item) => item.found.severity === "warning" && item.found.target === id);

  const assumptions = assumptionViews(spec, state);
  const criteria = (sections.criteria?.items ?? []).map((item) => ({
    id: item.id,
    text: item.text,
    warnings: warningsFor(item.id).map((warning) => warning.text),
  }));
  const groups = fileGroups(spec);
  const tasks = taskViews(spec, state, warningsFor);
  const reviewComments = commentViews(comments);

  const present: Readonly<Record<ReviewSection, boolean>> = {
    goal: Boolean(sections.goal),
    outOfScope: Boolean(sections.outOfScope),
    assumptions: assumptions.length > 0,
    criteria: criteria.length > 0,
    files: groups.size > 0,
    tasks: tasks.length > 0,
    risks: (sections.risks?.items.length ?? 0) > 0,
    design: Boolean(sections.design),
  };
  return {
    goal: sections.goal ?? sections.reason ?? "",
    outOfScope: sections.outOfScope ?? "",
    design: sections.design ?? "",
    assumptions,
    criteria,
    files: [...groups].map(([module, files]) => ({ module, files })),
    tasks,
    risks: (sections.risks?.items ?? []).map((risk) => ({ id: risk.id, text: risk.text })),
    comments: reviewComments,
    index: sectionIndex(present, assumptions, reviewComments, found),
    errors: found.filter((item) => item.found.severity === "error").map((item) => item.text),
  };
}

/** Each assumption with its impact and the person's decision on it. */
function assumptionViews(spec: Spec, state: ChangeState): AssumptionView[] {
  return (spec.sections.assumptions?.items ?? []).map((item): AssumptionView => {
    const decided = state.items[item.id];
    return {
      id: item.id,
      text: item.text,
      ...(item.impact === undefined ? {} : { impact: item.impact }),
      decision: decided?.decision ?? "pending",
      ...(decided?.comment === undefined ? {} : { comment: decided.comment }),
    };
  });
}

/** The spec's files by module, in the order they first appear. */
function fileGroups(spec: Spec): Map<string, FileView[]> {
  const groups = new Map<string, FileView[]>();
  for (const entry of spec.sections.files?.items ?? []) {
    const module = moduleOf(entry.path);
    groups.set(module, [
      ...(groups.get(module) ?? []),
      {
        path: entry.path,
        action: entry.action,
        ...(entry.from === undefined ? {} : { from: entry.from }),
        ...(entry.reason === undefined ? {} : { reason: entry.reason }),
        sensitive: isSensitive(entry.path, DEFAULT_CONFIG),
      },
    ]);
  }
  return groups;
}

/** Each task with its status, its criteria, its files and its warnings. */
function taskViews(
  spec: Spec,
  state: ChangeState,
  warningsFor: (id: string) => readonly Found[],
): ReviewView["tasks"] {
  return (spec.sections.tasks?.items ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    status: state.tasks[task.id]?.status ?? (task.done ? "done" : "pending"),
    ac: task.ac === "none" || task.ac === undefined ? [] : task.ac,
    files: task.files,
    warnings: warningsFor(task.id).map((warning) => warning.text),
  }));
}

/** The comments with their section, the open ones first and each group from the oldest. */
function commentViews(comments: readonly CommentRecord[]): CommentView[] {
  return comments
    .map(
      (comment): CommentView => ({
        ...comment,
        section: sectionOf(comment.anchor),
        resolved: comment.resolvedInRevision !== undefined,
      }),
    )
    .toSorted(
      (a, b) => Number(a.resolved) - Number(b.resolved) || a.createdAt.localeCompare(b.createdAt),
    );
}

/** Each section in order: whether it is there, its pending decisions, open comments and warnings. */
function sectionIndex(
  present: Readonly<Record<ReviewSection, boolean>>,
  assumptions: readonly AssumptionView[],
  comments: readonly CommentView[],
  found: readonly Found[],
): SectionIndexView[] {
  return SECTIONS.map(
    (key): SectionIndexView => ({
      key,
      present: present[key],
      pending:
        key === "assumptions"
          ? assumptions.filter((item) => item.impact === "high" && item.decision === "pending")
              .length
          : 0,
      comments: comments.filter((comment) => !comment.resolved && comment.section === key).length,
      warnings: found.filter(
        (item) =>
          item.found.severity === "warning" &&
          item.found.target !== undefined &&
          parseItemId(item.found.target) !== undefined &&
          SECTION_BY_PREFIX[parseItemId(item.found.target)?.prefix ?? ""] === key,
      ).length,
    }),
  );
}
