// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import type { SizeLevel } from "../sizing/size";

/**
 * `flow` and `lanes` in `.specty/config.yaml`: the rules of a change's flow that the person sets
 * (formats.md §6).
 */
export interface FlowConfig {
  readonly flow: {
    /**
     * `false`: accepting a standard change outside an epic closes it, as a quick one, with no
     * closing phase: its tasks' summaries are its closing, and there is no retro.
     */
    readonly closing: boolean;
    /**
     * The size from which `propose` recommends the independent review of the spec, and the
     * acceptance the one of the result, when the person set one up (`review.command`).
     */
    readonly reviewFrom: SizeLevel;
  };
  /** The quick lane: the code files and the tasks of its first proposal. */
  readonly lanes: { readonly quick: { readonly maxFiles: number; readonly maxTasks: number } };
}

export const DEFAULT_FLOW: FlowConfig = {
  flow: { closing: true, reviewFrom: "L" },
  lanes: { quick: { maxFiles: 3, maxTasks: 1 } },
};

const Positive = z.number().int().positive();

/** The blocks this module owns, for `config.ts` to spread among its keys. */
export const FLOW_SHAPE = {
  flow: z
    .strictObject({
      closing: z.boolean().optional(),
      reviewFrom: z.enum(["S", "M", "L", "XL"]).optional(),
    })
    .optional(),
  lanes: z
    .strictObject({
      quick: z
        .strictObject({ maxFiles: Positive.optional(), maxTasks: Positive.optional() })
        .optional(),
    })
    .optional(),
};

/** What `config.yaml` may hold of these blocks. */
interface FlowInput {
  readonly flow?: z.infer<typeof FLOW_SHAPE.flow>;
  readonly lanes?: z.infer<typeof FLOW_SHAPE.lanes>;
}

/** The `flow` and `lanes` blocks with their defaults applied. */
export function resolveFlow(input: FlowInput): FlowConfig {
  const { flow, lanes } = DEFAULT_FLOW;
  const quick = input.lanes?.quick;
  return {
    flow: {
      closing: input.flow?.closing ?? flow.closing,
      reviewFrom: input.flow?.reviewFrom ?? flow.reviewFrom,
    },
    lanes: {
      quick: {
        maxFiles: quick?.maxFiles ?? lanes.quick.maxFiles,
        maxTasks: quick?.maxTasks ?? lanes.quick.maxTasks,
      },
    },
  };
}
