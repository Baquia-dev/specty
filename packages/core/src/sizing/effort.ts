// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import type { ResolvedConfig } from "../schema/config";
import { EFFORT_LEVELS, type EffortLevel, type Spec, type Task } from "../spec/model";
import type { SizeLevel } from "./size";

export type { EffortLevel } from "../spec/model";

export interface EffortRecommendation {
  /** Writing and reviewing the spec. */
  readonly plan: EffortLevel;
  /** Implementing well-specified tasks: usually one level lower. */
  readonly implement: EffortLevel;
  /** The model's reasons, when its `effort` raised a level; absent when Specty's stands. */
  readonly raisedBy?: readonly string[];
}

const BY_LEVEL: Readonly<Record<SizeLevel, EffortRecommendation>> = {
  S: { plan: "medium", implement: "low" },
  M: { plan: "high", implement: "medium" },
  L: { plan: "high", implement: "medium" },
  XL: { plan: "max", implement: "high" },
};

/**
 * Effort by size; with the spec, the model's `effort` (the review's in the frontmatter, each
 * task's for the implementation) may raise it, never lower it.
 */
export function recommendEffort(level: SizeLevel, spec?: Spec): EffortRecommendation {
  const base = BY_LEVEL[level];
  if (spec === undefined) return base;
  const review = spec.frontmatter.effort;
  const tasks = (spec.sections.tasks?.items ?? []).flatMap((task) =>
    task.effort === undefined ? [] : [task.effort],
  );
  const plan = higher(base.plan, review?.review);
  const implement = tasks.reduce(
    (current, effort) => higher(current, effort.level),
    base.implement,
  );
  if (plan === base.plan && implement === base.implement) return base;
  const raisedBy = [
    ...(review !== undefined && above(review.review, base.plan) ? [review.reason] : []),
    ...tasks.flatMap((effort) =>
      above(effort.level, base.implement) && effort.reason !== undefined ? [effort.reason] : [],
    ),
  ];
  return { plan, implement, raisedBy };
}

/** Effort for one task: more files or sensitive paths call for more; the model may raise it. */
export function recommendTaskEffort(
  task: Task,
  config: Pick<ResolvedConfig, "sensitive">,
): EffortLevel {
  const sensitive = task.files.some((path) => matchesAny(path, config.sensitive));
  const base: EffortLevel =
    sensitive || task.files.length > 3 ? "high" : task.files.length <= 1 ? "low" : "medium";
  return higher(base, task.effort?.level);
}

function higher(base: EffortLevel, model: EffortLevel | undefined): EffortLevel {
  return model !== undefined && above(model, base) ? model : base;
}

function above(level: EffortLevel, than: EffortLevel): boolean {
  return EFFORT_LEVELS.indexOf(level) > EFFORT_LEVELS.indexOf(than);
}
