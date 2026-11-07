// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import type { SizeLevel } from "../sizing/size";
import { EFFORT_LEVELS, type EffortLevel } from "../spec/model";

/** The points each signal of a change's size adds (ARCHITECTURE §11). */
interface SizeWeights {
  /** Each hand-written file the change creates, modifies, deletes or renames. */
  readonly create: number;
  readonly modify: number;
  readonly delete: number;
  readonly rename: number;
  /** Each module past the first. */
  readonly module: number;
  /** Each sensitive path. */
  readonly sensitive: number;
  /** Once, when a manifest of dependencies changes. */
  readonly dependencies: number;
  /** Each task past `tasksWithoutWeight`. */
  readonly task: number;
  /** Each widely imported file, when the repository's signals say. */
  readonly fanIn: number;
  /** Each module without tests, when the repository's signals say. */
  readonly noTests: number;
}

/**
 * `sizing` in `.specty/config.yaml`: how a change's size is scored, and from when it is close to
 * splitting (formats.md §6).
 */
export interface SizingConfig {
  readonly weights: SizeWeights;
  /** The tasks that add no points. */
  readonly tasksWithoutWeight: number;
  /** How many files must import a file for it to count as widely imported. */
  readonly highFanIn: number;
  /** The share of `split.maxTasks` and `split.maxFiles` from which `propose` warns. */
  readonly nearRatio: number;
}

/** The effort to write and review the spec (`plan`) and to implement it. */
interface EffortPair {
  readonly plan: EffortLevel;
  readonly implement: EffortLevel;
}

/** `effort` in `.specty/config.yaml`: the effort recommended for each size and for a task. */
export type EffortConfig = Readonly<Record<SizeLevel, EffortPair>> & {
  /**
   * A task is `high` from `highMinFiles` files or with a sensitive path, `low` up to
   * `lowMaxFiles`, and `medium` in between.
   */
  readonly task: { readonly lowMaxFiles: number; readonly highMinFiles: number };
};

export const DEFAULT_SIZING: SizingConfig = {
  weights: {
    create: 1,
    modify: 1,
    delete: 2,
    rename: 2,
    module: 2,
    sensitive: 3,
    dependencies: 2,
    task: 1,
    fanIn: 1,
    noTests: 2,
  },
  tasksWithoutWeight: 3,
  highFanIn: 10,
  nearRatio: 0.8,
};

export const DEFAULT_EFFORT: EffortConfig = {
  S: { plan: "medium", implement: "low" },
  M: { plan: "high", implement: "medium" },
  L: { plan: "high", implement: "medium" },
  XL: { plan: "max", implement: "high" },
  task: { lowMaxFiles: 1, highMinFiles: 4 },
};

/** A weight, or a count of files or tasks: 0 turns a signal off. */
const Count = z.number().int().min(0);
const Effort = z.enum(EFFORT_LEVELS);
const Pair = z.strictObject({ plan: Effort, implement: Effort }).partial().optional();

/** The blocks this module owns, for `config.ts` to gather at the top of `config.yaml`. */
export const SIZING_SHAPE = {
  sizing: z
    .strictObject({
      weights: z
        .strictObject({
          create: Count,
          modify: Count,
          delete: Count,
          rename: Count,
          module: Count,
          sensitive: Count,
          dependencies: Count,
          task: Count,
          fanIn: Count,
          noTests: Count,
        })
        .partial()
        .optional(),
      tasksWithoutWeight: Count.optional(),
      highFanIn: z.number().int().positive().optional(),
      nearRatio: z.number().gt(0).max(1).optional(),
    })
    .optional(),
  effort: z
    .strictObject({
      S: Pair,
      M: Pair,
      L: Pair,
      XL: Pair,
      task: z
        .strictObject({
          lowMaxFiles: Count.optional(),
          highMinFiles: z.number().int().positive().optional(),
        })
        // With a key unset, its default: `lowMaxFiles: 5` alone would leave no medium nor high.
        .refine(
          (task) =>
            (task.lowMaxFiles ?? DEFAULT_EFFORT.task.lowMaxFiles) <
            (task.highMinFiles ?? DEFAULT_EFFORT.task.highMinFiles),
          { message: "lowMaxFiles must be below highMinFiles.", path: ["lowMaxFiles"] },
        )
        .optional(),
    })
    .optional(),
};

/** What `config.yaml` may hold of these blocks. */
interface SizingInput {
  readonly sizing?: z.infer<typeof SIZING_SHAPE.sizing>;
  readonly effort?: z.infer<typeof SIZING_SHAPE.effort>;
}

/** The `sizing` and `effort` blocks with their defaults applied, each key on its own. */
export function resolveSizing(input: SizingInput): {
  readonly sizing: SizingConfig;
  readonly effort: EffortConfig;
} {
  const base = DEFAULT_SIZING;
  const sizing = input.sizing;
  return {
    sizing: {
      weights: weightsOf(sizing?.weights),
      tasksWithoutWeight: sizing?.tasksWithoutWeight ?? base.tasksWithoutWeight,
      highFanIn: sizing?.highFanIn ?? base.highFanIn,
      nearRatio: sizing?.nearRatio ?? base.nearRatio,
    },
    effort: effortOf(input.effort),
  };
}

function weightsOf(input: NonNullable<SizingInput["sizing"]>["weights"]): SizeWeights {
  const weight = (signal: keyof SizeWeights): number =>
    input?.[signal] ?? DEFAULT_SIZING.weights[signal];
  return {
    create: weight("create"),
    modify: weight("modify"),
    delete: weight("delete"),
    rename: weight("rename"),
    module: weight("module"),
    sensitive: weight("sensitive"),
    dependencies: weight("dependencies"),
    task: weight("task"),
    fanIn: weight("fanIn"),
    noTests: weight("noTests"),
  };
}

function effortOf(input: SizingInput["effort"]): EffortConfig {
  const base = DEFAULT_EFFORT;
  const pair = (level: SizeLevel): EffortPair => ({
    plan: input?.[level]?.plan ?? base[level].plan,
    implement: input?.[level]?.implement ?? base[level].implement,
  });
  return {
    S: pair("S"),
    M: pair("M"),
    L: pair("L"),
    XL: pair("XL"),
    task: {
      lowMaxFiles: input?.task?.lowMaxFiles ?? base.task.lowMaxFiles,
      highMinFiles: input?.task?.highMinFiles ?? base.task.highMinFiles,
    },
  };
}
