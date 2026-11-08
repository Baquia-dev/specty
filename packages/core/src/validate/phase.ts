// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { parseItemId } from "../ids";
import { itemHashes } from "../spec/canonical";
import { specDelta } from "../spec/delta";
import type { Diagnostic } from "../spec/diagnostics";
import type { ChangeKind, Spec } from "../spec/model";
import { itemLine, type Rule, report, type ValidationContext } from "./context";
import { declaredPaths, isDeclared } from "./references";

/**
 * The phases where an adjustment is proposed: once proposed, it goes on in its review, also after
 * the person asks for changes. Only an adjustment has an approved revision in review.
 */
const ADJUSTMENT_PHASES: ReadonlySet<string> = new Set(["adjusting", "review"]);

/**
 * Adjustments add work: done tasks are immutable, new files may be new scope. One asked for while
 * the tasks are implemented only corrects the pending ones (ARCHITECTURE §12). It holds in the
 * adjustment's review too, which `approve` validates.
 */
export const checkAdjusting: Rule = (spec, ctx, lang) => {
  const approved = ctx.approved;
  if (!ADJUSTMENT_PHASES.has(ctx.phase) || approved === undefined) return [];
  const done = ctx.doneTasks ?? new Set<string>();
  const before = itemHashes(approved);
  const after = itemHashes(spec);
  const changed = [...done]
    .filter((id) => before.has(id) && before.get(id) !== after.get(id))
    .map((id) =>
      report(lang, {
        code: "done-task-changed",
        params: { id },
        line: itemLine(ctx, id),
        target: id,
      }),
    );
  const outside =
    ctx.doneTasks !== undefined && adjustsPendingTasks(approved, ctx.doneTasks)
      ? outsidePendingTasks(approved, spec).map((id) =>
          report(lang, {
            code: "pending-tasks-only",
            params: { id },
            line: itemLine(ctx, id),
            target: id,
          }),
        )
      : [];
  return [...changed, ...outside, ...newScope(approved, spec, done, ctx, lang)];
};

/**
 * An adjustment asked for while the tasks are implemented: the approved revision still has tasks
 * to do. In acceptance every one is done, and an epic has none. The adjusting card asks the same
 * (`ChangeView.pendingTasksOnly`).
 */
export function adjustsPendingTasks(approved: Spec, done: ReadonlySet<string>): boolean {
  return (approved.sections.tasks?.items ?? []).some((task) => !done.has(task.id));
}

/** The tasks added or removed and the criteria changed since the approved revision. */
function outsidePendingTasks(approved: Spec, spec: Spec): string[] {
  return specDelta(approved, spec)
    .entries.filter(
      (entry) =>
        (entry.kind === "task" && entry.change !== "modified") || entry.kind === "criterion",
    )
    .map((entry) => entry.key);
}

/** The files of the tasks still to do that were not in the approved scope: possibly new scope. */
function newScope(
  approved: Spec,
  spec: Spec,
  done: ReadonlySet<string>,
  ctx: ValidationContext,
  lang: Lang,
): Diagnostic[] {
  const approvedFiles = declaredPaths(approved);
  return (spec.sections.tasks?.items ?? [])
    .filter((task) => !done.has(task.id))
    .flatMap((task) =>
      task.files
        .filter((path) => !isDeclared(path, approvedFiles))
        .map((path) =>
          report(lang, {
            code: "possible-new-scope",
            params: { id: task.id, path },
            line: itemLine(ctx, task.id),
            target: task.id,
          }),
        ),
    );
}

/**
 * An epic's adjustment does not modify or remove a closed slice: each one stays as approved, or as
 * the adjustment's last proposal left it, which Specty validated while its change was still open.
 * Only an adjustment has an approved revision in review.
 */
export const checkClosedSlices: Rule = (spec, ctx, lang) => {
  const { approved, closedSlices } = ctx;
  if (!ADJUSTMENT_PHASES.has(ctx.phase) || approved === undefined || closedSlices === undefined) {
    return [];
  }
  const before = itemHashes(approved);
  const kept = [before, ...(ctx.previous === undefined ? [] : [itemHashes(ctx.previous)])];
  const after = itemHashes(spec);
  // A removed slice matches nothing, also when the last proposal had removed it.
  const isKept = (id: string) => {
    const now = after.get(id);
    return now !== undefined && kept.some((hashes) => hashes.get(id) === now);
  };
  return [...closedSlices]
    .filter(([id]) => before.has(id) && !isKept(id))
    .map(([id, change]) =>
      report(lang, {
        code: "closed-slice-changed",
        params: { id, change },
        line: itemLine(ctx, id),
        target: id,
      }),
    );
};

/** While closing, only the Closing section may change. */
export const checkClosing: Rule = (spec, ctx, lang) => {
  const approved = ctx.approved;
  if (ctx.phase !== "closing" || approved === undefined) return [];
  const before = itemHashes(approved);
  const after = itemHashes(spec);
  const keys = [...new Set([...before.keys(), ...after.keys()])].filter(
    (key) => key !== "section:closing",
  );
  return keys
    .filter((key) => before.get(key) !== after.get(key))
    .map((key) => report(lang, { code: "closing-outside", params: { target: key }, target: key }));
};

/**
 * The kind the change has in its state. Before its first approval, a draft takes the frontmatter's
 * (`propose` writes it in the state), so a too-large change becomes an epic in place; but a slice
 * is never an epic, and a retro, which only `specty retro` creates, never changes kind. Once
 * approved, the kind is fixed.
 */
export const checkKind: Rule = (spec, ctx, lang) => {
  const from = ctx.kind;
  const { kind: to, epic } = spec.frontmatter;
  if (from === undefined || from === to) return [];
  if (to === "epic" && epic !== undefined) {
    return [report(lang, { code: "slice-epic", params: { from, epic } })];
  }
  const reason = fixedBy(from, to, ctx);
  return reason === undefined
    ? []
    : [report(lang, { code: "kind-fixed", params: { from, to, reason } })];
};

/** Why the kind cannot change: the change was approved, or a retro is involved. */
function fixedBy(
  from: ChangeKind,
  to: ChangeKind,
  ctx: ValidationContext,
): "approved" | "retro" | undefined {
  if (ctx.approved !== undefined) return "approved";
  return from === "retro" || to === "retro" ? "retro" : undefined;
}

/** A deleted id is never given to a different item. */
export const checkIdReuse: Rule = (spec, ctx, lang) => {
  const { previous, maxIds } = ctx;
  if (previous === undefined || maxIds === undefined) return [];
  const known = new Set(itemIds(previous));
  return itemIds(spec).flatMap((id): Diagnostic[] => {
    const parsed = parseItemId(id);
    if (parsed === undefined || known.has(id)) return [];
    const max = maxIds[parsed.prefix] ?? 0;
    if (parsed.number > max) return [];
    return [
      report(lang, {
        code: "id-reused",
        params: { id, next: `${parsed.prefix}${max + 1}` },
        line: itemLine(ctx, id),
        target: id,
      }),
    ];
  });
};

function itemIds(spec: Spec): string[] {
  const { sections } = spec;
  return [
    ...(sections.assumptions?.items ?? []),
    ...(sections.criteria?.items ?? []),
    ...(sections.tasks?.items ?? []),
    ...(sections.slices?.items ?? []),
    ...(sections.risks?.items ?? []),
  ].map((item) => item.id);
}
