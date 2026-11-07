// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * `internal.waits`, `internal.retries` and `internal.retention` in `.specty/config.yaml`: how long
 * `specty wait` waits, how far apart its heartbeat goes, how often a waiting verification and
 * `specty wait` look again, how long a place in the verifications' queues lasts without renewing,
 * how many more times `close` lands when main moved, how many more times the memory and git's
 * configuration are written when another process got there first, how many days the record of
 * units keeps one and how many hours `specty prune` leaves a temporary git index (formats.md §6).
 * The lives of compliance have no key: receipts, guard pending, shell snapshots and sessions stay
 * fixed at 24 h, and the mark of `specty wait` at 30 s.
 */
export interface InternalWaitsConfig {
  readonly waits: {
    /** How long `specty wait` waits without `--timeout`, in seconds. */
    readonly waitTimeoutSec: number;
    /** How far apart its heartbeat line goes at most where the tool needs it, in seconds. */
    readonly heartbeatSec: number;
    /** How often a verification waiting for the full one's turn or a place looks again, in ms. */
    readonly verifyIntervalMs: number;
    /** How often `specty wait` without `--interval` looks whether the person decided, in ms. */
    readonly waitIntervalMs: number;
    /** How long a place in the verifications' queues counts without renewing, in seconds. */
    readonly queueStaleSec: number;
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
    /** How many hours `specty prune` leaves a temporary git index before removing it. */
    readonly indexHours: number;
  };
}

export const DEFAULT_INTERNAL_WAITS: InternalWaitsConfig = {
  waits: {
    waitTimeoutSec: 3300,
    heartbeatSec: 60,
    verifyIntervalMs: 2000,
    waitIntervalMs: 500,
    queueStaleSec: 30,
  },
  retries: { landing: 2, memory: 9, gitConfig: 5 },
  retention: { verifiedDays: 30, indexHours: 1 },
};

/**
 * The blocks of `internal` this module owns, for `config.ts` to gather under `internal`. The wait
 * holds an hour at most, what every tool measured holds (`cards/wait.ts`), and 55 min by default,
 * so that the agent wakes up while its prompt cache, which lasts an hour since its last use, is
 * still alive; the heartbeat, 240 s at most, because Gemini CLI cuts a command that writes nothing
 * for 300 s. The intervals go from 100 ms, below which a look spins for nothing, to 10 s, so a
 * waiting verification renews its file of the queue three times at least before it goes stale
 * (30 s). A place in a queue lasts 10 s at least, and never less than three of the queue's looks
 * (`turn-queue.ts`), so a live process does not lose it between two. The memory and git's
 * configuration are tried once more at least, so one clash with another session does not make a
 * command fail. A temporary index lives an hour at least, as today: `treeWith` uses one for
 * seconds, and a younger one may be a live process's.
 */
export const INTERNAL_WAITS_SHAPE = {
  waits: z
    .strictObject({
      waitTimeoutSec: z.number().int().min(60).max(3600).optional(),
      heartbeatSec: z.number().int().min(1).max(240).optional(),
      verifyIntervalMs: z.number().int().min(100).max(10000).optional(),
      waitIntervalMs: z.number().int().min(100).max(10000).optional(),
      queueStaleSec: z.number().int().min(10).max(600).optional(),
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
    .strictObject({
      verifiedDays: z.number().int().min(1).max(365).optional(),
      indexHours: z.number().int().min(1).max(168).optional(),
    })
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
  const { waits, retries } = input ?? {};
  return {
    waits: {
      waitTimeoutSec: waits?.waitTimeoutSec ?? base.waits.waitTimeoutSec,
      heartbeatSec: waits?.heartbeatSec ?? base.waits.heartbeatSec,
      verifyIntervalMs: waits?.verifyIntervalMs ?? base.waits.verifyIntervalMs,
      waitIntervalMs: waits?.waitIntervalMs ?? base.waits.waitIntervalMs,
      queueStaleSec: waits?.queueStaleSec ?? base.waits.queueStaleSec,
    },
    retries: {
      landing: retries?.landing ?? base.retries.landing,
      memory: retries?.memory ?? base.retries.memory,
      gitConfig: retries?.gitConfig ?? base.retries.gitConfig,
    },
    retention: {
      verifiedDays: input?.retention?.verifiedDays ?? base.retention.verifiedDays,
      indexHours: input?.retention?.indexHours ?? base.retention.indexHours,
    },
  };
}
