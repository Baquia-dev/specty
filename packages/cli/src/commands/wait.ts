// SPDX-License-Identifier: Apache-2.0
import {
  isIntegrating,
  type Output,
  phasePermissions,
  waitTimeoutCard,
} from "@baquia-dev/specty-core";
import { resolveActive, withChangeLock } from "../flow/active";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { liveHolder } from "../store/lock";
import { next } from "./next";

export interface WaitOptions {
  readonly timeout?: string | number;
  readonly interval?: string | number;
}

interface WaitLimits {
  readonly timeoutSec: number;
  readonly intervalMs: number;
}

/** Parses timeout and polling interval options safely. */
function parseWaitLimits(options: WaitOptions): WaitLimits {
  const timeout = Number(options.timeout);
  const interval = Number(options.interval);
  return {
    timeoutSec: Number.isFinite(timeout) && timeout > 0 ? timeout : 3600,
    intervalMs: Number.isFinite(interval) && interval > 0 ? interval : 500,
  };
}

/** Checks whether the active change is waiting for a person's decision or action. */
export function isWaitingForHuman(change: StoredChange): boolean {
  const { state } = change;
  if (state.pending.scopeRequests.length > 0) return true;
  const submitted =
    (state.phase === "testing" ? state.testsSubmittedAt : state.closingSubmittedAt) !== undefined;
  return phasePermissions(state.phase, submitted, isIntegrating(state)).waitingFor === "human";
}

function isReady(change: StoredChange | undefined): boolean {
  return change === undefined || !isWaitingForHuman(change);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `specty wait`: passively polls until the active change is no longer waiting for the person,
 * then returns the card of `next`.
 */
export async function wait(session: Session, options: WaitOptions = {}): Promise<Output> {
  let current = await resolveActive(session);
  if (isReady(current)) {
    return withChangeLock(session, "next", () => next(session));
  }

  const started = Date.now();
  const { timeoutSec, intervalMs } = parseWaitLimits(options);
  const timeoutMs = timeoutSec * 1000;

  while (true) {
    await sleep(intervalMs);
    if (Date.now() - started >= timeoutMs) {
      return waitTimeoutCard(current.state.id, timeoutSec, session.cards);
    }
    if ((await liveHolder(session.git, current.state.id)) !== undefined) {
      continue;
    }
    current = await resolveActive(session);
    if (isReady(current)) {
      return withChangeLock(session, "next", () => next(session));
    }
  }
}
