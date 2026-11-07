// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * `internal.exec` and `internal.server` in `.specty/config.yaml`: the priority Specty's
 * verifications run at, the most it reads of a command's output and how many ports `specty ui`
 * tries (formats.md §6).
 */
export interface InternalRunConfig {
  readonly exec: {
    /** The `nice` priority of the verifications; one already lower than Specty's stays as it is. */
    readonly priority: number;
    /**
     * The most Specty reads of a command whose whole text it uses, in KiB of each stream: those of
     * `checks.commands` and `review.command`; also the most the UI serves of a diff, a trace or a
     * test's code.
     */
    readonly maxOutputKiB: number;
  };
  readonly server: {
    /** How many ports `specty ui` tries from the first, when that one is taken. */
    readonly portsTried: number;
  };
}

export const DEFAULT_INTERNAL_RUN: InternalRunConfig = {
  exec: { priority: 10, maxOutputKiB: 512 },
  server: { portsTried: 20 },
};

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The
 * priority goes from 0 to 19, the range of `nice` a process without privileges lowers itself in.
 * The output, from 64 KiB, which still holds the diff and the review of an ordinary change, to
 * 16 MiB, since Specty keeps two streams of each command in memory.
 */
export const INTERNAL_RUN_SHAPE = {
  exec: z
    .strictObject({
      priority: z.number().int().min(0).max(19).optional(),
      maxOutputKiB: z.number().int().min(64).max(16384).optional(),
    })
    .optional(),
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
    exec: {
      priority: input?.exec?.priority ?? base.exec.priority,
      maxOutputKiB: input?.exec?.maxOutputKiB ?? base.exec.maxOutputKiB,
    },
    server: { portsTried: input?.server?.portsTried ?? base.server.portsTried },
  };
}
