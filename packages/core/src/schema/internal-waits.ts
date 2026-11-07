// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * `internal.waits`, `internal.retries` and `internal.retention` in `.specty/config.yaml`: how long
 * `specty wait` waits, how far apart its heartbeat goes, how many more times `close` lands when
 * main moved, how many more times the memory and git's configuration are written when another
 * process got there first, and how many days the record of units keeps one (formats.md §6). The
 * four lives of compliance (receipts, guard pending, shell snapshots and sessions) have no key:
 * they stay fixed at 24 h.
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
    /** How many more times an entry of the memory is written when another session wrote first. */
    readonly memory: number;
    /** How many more times `new` ties a branch to its change while git's configuration is locked. */
    readonly gitConfig: number;
  };
  readonly retention: {
    /** How many days the clone's record keeps a unit that passed before `specty prune` removes it. */
    readonly verifiedDays: number;
  };
}

export const DEFAULT_INTERNAL_WAITS: InternalWaitsConfig = {
  waits: { waitTimeoutSec: 3600, heartbeatSec: 60 },
  retries: { landing: 2, memory: 9, gitConfig: 5 },
  retention: { verifiedDays: 30 },
};

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The wait
 * holds an hour at most, what every tool measured holds (`cards/wait.ts`); the heartbeat, 240 s at
 * most, because Gemini CLI cuts a command that writes nothing for 300 s. The memory and git's
 * configuration are tried once more at least, so one clash with another session does not make a
 * command fail.
 */
export const INTERNAL_WAITS_SHAPE = {
  waits: z
    .strictObject({
      waitTimeoutSec: z.number().int().min(60).max(3600).optional(),
      heartbeatSec: z.number().int().min(1).max(240).optional(),
    })
    .optional(),
  retries: z
    .strictObject({
      landing: z.number().int().min(0).max(10).optional(),
      memory: z.number().int().min(1).max(50).optional(),
      gitConfig: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
  retention: z
    .strictObject({ verifiedDays: z.number().int().min(1).max(365).optional() })
    .optional(),
};

/** What `config.yaml` may hold of these blocks under `internal`. */
interface InternalWaitsInput {
  readonly waits?: z.infer<typeof INTERNAL_WAITS_SHAPE.waits>;
  readonly retries?: z.infer<typeof INTERNAL_WAITS_SHAPE.retries>;
  readonly retention?: z.infer<typeof INTERNAL_WAITS_SHAPE.retention>;
}

/** The `internal.waits`, `internal.retries` and `internal.retention` blocks with their defaults. */
export function resolveInternalWaits(input: InternalWaitsInput | undefined): InternalWaitsConfig {
  const base = DEFAULT_INTERNAL_WAITS;
  const retries = input?.retries;
  return {
    waits: {
      waitTimeoutSec: input?.waits?.waitTimeoutSec ?? base.waits.waitTimeoutSec,
      heartbeatSec: input?.waits?.heartbeatSec ?? base.waits.heartbeatSec,
    },
    retries: {
      landing: retries?.landing ?? base.retries.landing,
      memory: retries?.memory ?? base.retries.memory,
      gitConfig: retries?.gitConfig ?? base.retries.gitConfig,
    },
    retention: {
      verifiedDays: input?.retention?.verifiedDays ?? base.retention.verifiedDays,
    },
  };
}
