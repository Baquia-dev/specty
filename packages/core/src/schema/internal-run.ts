// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * `internal.exec`, `internal.server` and `internal.hooks` in `.specty/config.yaml`: the priority
 * Specty's verifications run at, the most it reads of a command's output, how many ports `specty
 * ui` tries and how long Antigravity lets the guard's hooks run (formats.md §6).
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
  readonly hooks: {
    /**
     * How long Antigravity lets each hook of Specty's guard run before it cuts it and blocks the
     * tool, in seconds: what `init` writes in `.agents/hooks.json`.
     */
    readonly antigravityTimeoutSec: number;
  };
}

export const DEFAULT_INTERNAL_RUN: InternalRunConfig = {
  exec: { priority: 10, maxOutputKiB: 512 },
  server: { portsTried: 20 },
  hooks: { antigravityTimeoutSec: 30 },
};

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The
 * priority goes from 0 to 19, the range of `nice` a process without privileges lowers itself in.
 * The output, from 64 KiB, which still holds the diff and the review of an ordinary change, to
 * 16 MiB, since Specty keeps two streams of each command in memory. Antigravity's hooks, from
 * 10 s, which lets Node start and the guard answer on a busy machine, to 300 s, which bounds how
 * long Antigravity stands still if the guard hangs.
 */
export const INTERNAL_RUN_SHAPE = {
  exec: z
    .strictObject({
      priority: z.number().int().min(0).max(19).optional(),
      maxOutputKiB: z.number().int().min(64).max(16384).optional(),
    })
    .optional(),
  server: z.strictObject({ portsTried: z.number().int().min(1).max(100).optional() }).optional(),
  hooks: z
    .strictObject({ antigravityTimeoutSec: z.number().int().min(10).max(300).optional() })
    .optional(),
};

/** What `config.yaml` may hold of these blocks under `internal`. */
interface InternalRunInput {
  readonly exec?: z.infer<typeof INTERNAL_RUN_SHAPE.exec>;
  readonly server?: z.infer<typeof INTERNAL_RUN_SHAPE.server>;
  readonly hooks?: z.infer<typeof INTERNAL_RUN_SHAPE.hooks>;
}

/** The `internal.exec`, `internal.server` and `internal.hooks` blocks with their defaults applied. */
export function resolveInternalRun(input: InternalRunInput | undefined): InternalRunConfig {
  const base = DEFAULT_INTERNAL_RUN;
  return {
    exec: {
      priority: input?.exec?.priority ?? base.exec.priority,
      maxOutputKiB: input?.exec?.maxOutputKiB ?? base.exec.maxOutputKiB,
    },
    server: { portsTried: input?.server?.portsTried ?? base.server.portsTried },
    hooks: {
      antigravityTimeoutSec:
        input?.hooks?.antigravityTimeoutSec ?? base.hooks.antigravityTimeoutSec,
    },
  };
}
