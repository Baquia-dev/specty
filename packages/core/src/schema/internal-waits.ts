// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * `internal.waits` and `internal.retries` in `.specty/config.yaml`: how long `specty wait` waits,
 * how far apart its heartbeat goes and how many more times `close` lands when main moved
 * (formats.md §6). The four lives of compliance (receipts, guard pending, shell snapshots and
 * sessions) have no key: they stay fixed at 24 h.
 */
export interface InternalWaitsConfig {
  readonly waits: {
    /** How long `specty wait` waits without `--timeout`, in seconds. */
    readonly waitTimeoutSec: number;
    /** How far apart its heartbeat line goes at most where the tool needs it, in seconds. */
    readonly heartbeatSec: number;
  };
  readonly retries: {
    /** How many more times `close` incorporates main and lands when main moved meanwhile. */
    readonly landing: number;
  };
}

export const DEFAULT_INTERNAL_WAITS: InternalWaitsConfig = {
  waits: { waitTimeoutSec: 3600, heartbeatSec: 60 },
  retries: { landing: 2 },
};

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The wait
 * holds an hour at most, what every tool measured holds (`cards/wait.ts`); the heartbeat, 240 s at
 * most, because Gemini CLI cuts a command that writes nothing for 300 s.
 */
export const INTERNAL_WAITS_SHAPE = {
  waits: z
    .strictObject({
      waitTimeoutSec: z.number().int().min(60).max(3600).optional(),
      heartbeatSec: z.number().int().min(1).max(240).optional(),
    })
    .optional(),
  retries: z.strictObject({ landing: z.number().int().min(0).max(10).optional() }).optional(),
};

/** What `config.yaml` may hold of these blocks under `internal`. */
interface InternalWaitsInput {
  readonly waits?: z.infer<typeof INTERNAL_WAITS_SHAPE.waits>;
  readonly retries?: z.infer<typeof INTERNAL_WAITS_SHAPE.retries>;
}

/** The `internal.waits` and `internal.retries` blocks with their defaults applied. */
export function resolveInternalWaits(input: InternalWaitsInput | undefined): InternalWaitsConfig {
  const base = DEFAULT_INTERNAL_WAITS;
  return {
    waits: {
      waitTimeoutSec: input?.waits?.waitTimeoutSec ?? base.waits.waitTimeoutSec,
      heartbeatSec: input?.waits?.heartbeatSec ?? base.waits.heartbeatSec,
    },
    retries: { landing: input?.retries?.landing ?? base.retries.landing },
  };
}
