// SPDX-License-Identifier: Apache-2.0
import { globBase, isGlob, matchesPattern } from "../glob";
import { isWithin } from "../paths";
import type { Diagnostic } from "../spec/diagnostics";
import type { Slice, Spec, Task } from "../spec/model";
import { TYPES_WITHOUT_CRITERIA } from "../spec/vocabulary";
import { itemLine, type Rule, report } from "./context";

/** Paths declared in the Files section, including the old side of renames. */
export function declaredPaths(spec: Spec): readonly string[] {
  return (spec.sections.files?.items ?? []).flatMap((entry) =>
    entry.from === undefined ? [entry.path] : [entry.path, entry.from],
  );
}

/** True when a task path is covered by a Files entry (same path, or inside a `/**` glob). */
export function isDeclared(path: string, declared: readonly string[]): boolean {
  return declared.some((entry) => {
    if (entry === path) return true;
    if (!isGlob(entry)) return false;
    if (!isGlob(path)) return matchesPattern(path, entry);
    return entry.endsWith("**") && isWithin(globBase(path), globBase(entry));
  });
}

/** Task files, criteria references and verification. */
export const checkTasks: Rule = (spec, ctx, lang) => {
  const { kind } = spec.frontmatter;
  const declared = declaredPaths(spec);
  const criteria = new Set((spec.sections.criteria?.items ?? []).map((item) => item.id));
  const needsCriteria = kind === "standard";
  return (spec.sections.tasks?.items ?? []).flatMap((task): Diagnostic[] => {
    const line = itemLine(ctx, task.id);
    const at = { line, target: task.id };
    const files =
      task.files.length === 0
        ? [report(lang, { code: "task-files-missing", params: { id: task.id }, ...at })]
        : task.files
            .filter((path) => !isDeclared(path, declared))
            .map((path) =>
              report(lang, { code: "task-file-undeclared", params: { id: task.id, path }, ...at }),
            );
    const verify =
      task.verify === undefined && ctx.config.verify.default === undefined
        ? [report(lang, { code: "task-verify-missing", params: { id: task.id }, ...at })]
        : [];
    return [...files, ...criteriaOf(task, criteria, needsCriteria, lang, at), ...verify];
  });
};

function criteriaOf(
  task: Task,
  criteria: ReadonlySet<string>,
  needsCriteria: boolean,
  lang: Parameters<Rule>[2],
  at: { readonly line: number | undefined; readonly target: string },
): Diagnostic[] {
  if (task.ac === undefined) {
    return needsCriteria
      ? [report(lang, { code: "task-ac-missing", params: { id: task.id }, ...at })]
      : [];
  }
  if (task.ac === "none") {
    const allowed = task.type !== undefined && TYPES_WITHOUT_CRITERIA.has(task.type);
    return allowed
      ? []
      : [report(lang, { code: "task-ac-none-not-allowed", params: { id: task.id }, ...at })];
  }
  return task.ac
    .filter((ref) => !criteria.has(ref))
    .map((ref) => report(lang, { code: "reference-unknown", params: { id: task.id, ref }, ...at }));
}

/** Every criterion is covered by a task (or, in an epic, by a slice). */
export const checkCoverage: Rule = (spec, ctx, lang) => {
  const { kind } = spec.frontmatter;
  if (kind !== "standard" && kind !== "epic") return [];
  const covering =
    kind === "epic"
      ? (spec.sections.slices?.items ?? []).flatMap((slice) => slice.ac)
      : (spec.sections.tasks?.items ?? []).flatMap((task) =>
          task.ac === undefined || task.ac === "none" ? [] : task.ac,
        );
  const covered = new Set(covering);
  return (spec.sections.criteria?.items ?? [])
    .filter((criterion) => !covered.has(criterion.id))
    .map((criterion) =>
      report(lang, {
        code: "criterion-uncovered",
        params: { id: criterion.id, by: kind === "epic" ? "slice" : "task" },
        line: itemLine(ctx, criterion.id),
        target: criterion.id,
      }),
    );
};

/** Slice references exist and dependencies have no cycles. */
export const checkSlices: Rule = (spec, ctx, lang) => {
  const slices = spec.sections.slices?.items ?? [];
  const ids = new Set(slices.map((slice) => slice.id));
  const criteria = new Set((spec.sections.criteria?.items ?? []).map((item) => item.id));
  const unknown = slices.flatMap((slice) =>
    [
      ...slice.ac.filter((ref) => !criteria.has(ref)),
      ...slice.depends.filter((ref) => !ids.has(ref)),
    ].map((ref) =>
      report(lang, {
        code: "reference-unknown",
        params: { id: slice.id, ref },
        line: itemLine(ctx, slice.id),
        target: slice.id,
      }),
    ),
  );
  const cycle = findCycle(slices);
  const cycles =
    cycle === undefined
      ? []
      : [report(lang, { code: "slice-cycle", params: { cycle: cycle.join(" → ") } })];
  return [...unknown, ...cycles];
};

function findCycle(slices: readonly Slice[]): readonly string[] | undefined {
  const graph = new Map(slices.map((slice) => [slice.id, slice.depends] as const));
  const visit = (id: string, path: readonly string[]): readonly string[] | undefined => {
    if (path.includes(id)) return [...path.slice(path.indexOf(id)), id];
    for (const next of graph.get(id) ?? []) {
      const found = visit(next, [...path, id]);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const slice of slices) {
    const found = visit(slice.id, []);
    if (found !== undefined) return found;
  }
  return undefined;
}
