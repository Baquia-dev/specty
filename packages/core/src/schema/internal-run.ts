// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * `internal.exec` and `internal.server` in `.specty/config.yaml`: the priority Specty's
 * verifications run at and how many ports `specty ui` tries (formats.md §6).
 */
export interface InternalRunConfig {
  readonly exec: {
    /** The `nice` priority of the verifications; one already lower than Specty's stays as it is. */
    readonly priority: number;
  };
  readonly server: {
    /** How many ports `specty ui` tries from the first, when that one is taken. */
    readonly portsTried: number;
  };
}

export const DEFAULT_INTERNAL_RUN: InternalRunConfig = {
  exec: { priority: 10 },
  server: { portsTried: 20 },
};

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The
 * priority goes from 0 to 19, the range of `nice` a process without privileges lowers itself in.
 */
export const INTERNAL_RUN_SHAPE = {
  exec: z.strictObject({ priority: z.number().int().min(0).max(19).optional() }).optional(),
  server: z.strictObject({ portsTried: z.number().int().min(1).max(100).optional() }).optional(),
};

/** What `config.yaml` may hold of these blocks under `internal`. */
interface InternalRunInput {
  readonly exec?: z.infer<typeof INTERNAL_RUN_SHAPE.exec>;
  readonly server?: z.infer<typeof INTERNAL_RUN_SHAPE.server>;
}

/** The `internal.exec` and `internal.server` blocks with their defaults applied. */
export function resolveInternalRun(input: InternalRunInput | undefined): InternalRunConfig {
  const base = DEFAULT_INTERNAL_RUN;
  return {
    exec: { priority: input?.exec?.priority ?? base.exec.priority },
    server: { portsTried: input?.server?.portsTried ?? base.server.portsTried },
  };
}
