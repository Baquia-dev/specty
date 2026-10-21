// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import type { ResolvedConfig } from "../schema/config";
import type { Task } from "../spec/model";
import type { SizeLevel } from "./size";

/** Neutral effort levels; the CLI maps them to each tool's settings. */
export type EffortLevel = "low" | "medium" | "high" | "max";

export interface EffortRecommendation {
  /** Writing and reviewing the spec. */
  readonly plan: EffortLevel;
  /** Implementing well-specified tasks: usually one level lower. */
  readonly implement: EffortLevel;
}

const BY_LEVEL: Readonly<Record<SizeLevel, EffortRecommendation>> = {
  S: { plan: "medium", implement: "low" },
  M: { plan: "high", implement: "medium" },
  L: { plan: "high", implement: "medium" },
  XL: { plan: "max", implement: "high" },
};

export function recommendEffort(level: SizeLevel): EffortRecommendation {
  return BY_LEVEL[level];
}

/** Effort for one task: more files or sensitive paths call for more reasoning. */
export function recommendTaskEffort(
  task: Task,
  config: Pick<ResolvedConfig, "sensitive">,
): EffortLevel {
  const sensitive = task.files.some((path) => matchesAny(path, config.sensitive));
  if (sensitive || task.files.length > 3) return "high";
  return task.files.length <= 1 ? "low" : "medium";
}
