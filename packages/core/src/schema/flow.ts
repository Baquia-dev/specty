// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/** `flow` in `.specty/config.yaml`: the rules of a change's flow that the person sets (formats.md §6). */
export interface FlowConfig {
  readonly flow: {
    /**
     * `false`: accepting a standard change outside an epic closes it, as a quick one, with no
     * closing phase: its tasks' summaries are its closing, and there is no retro.
     */
    readonly closing: boolean;
  };
}

export const DEFAULT_FLOW: FlowConfig = { flow: { closing: true } };

/** The block this module owns, for `config.ts` to spread among its keys. */
export const FLOW_SHAPE = {
  flow: z.strictObject({ closing: z.boolean().optional() }).optional(),
};

/** What `config.yaml` may hold of this block. */
interface FlowInput {
  readonly flow?: z.infer<typeof FLOW_SHAPE.flow>;
}

/** The `flow` block with its defaults applied. */
export function resolveFlow(input: FlowInput): FlowConfig {
  return { flow: { closing: input.flow?.closing ?? DEFAULT_FLOW.flow.closing } };
}
