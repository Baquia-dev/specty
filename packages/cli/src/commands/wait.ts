// SPDX-License-Identifier: Apache-2.0
import {
  isIntegrating,
  type Output,
  phasePermissions,
  waitHeartbeat,
  waitTimeoutCard,
} from "@baquia-dev/specty-core";
import { resolveActive, withChangeLock } from "../flow/active";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { liveHolder } from "../store/lock";
import { markWait, type WaitMark } from "../store/waits";
import { next } from "./next";

export interface WaitOptions {
  readonly timeout?: string | number;
  readonly interval?: string | number;
  /** How far apart the heartbeat lines go at most, in milliseconds; tests shorten it. */
  readonly beatMs?: number;
}

interface WaitLimits {
  readonly timeoutSec: number;
  readonly intervalMs: number;
}

/**
 * How long `wait` waits without `--timeout`: every tool measured on 2026-11-06 holds an hour, in
 * the background or polling its output (`cards/wait.ts`).
 */
const TIMEOUT_SEC = 3600;

/** Gemini CLI cuts a command that writes nothing for 300 s: a heartbeat line at most a minute apart. */
const BEAT_MS = 60_000;

/** Parses timeout and polling interval options safely. */
function parseWaitLimits(options: WaitOptions): WaitLimits {
  const timeout = Number(options.timeout);
  const interval = Number(options.interval);
  return {
    timeoutSec: Number.isFinite(timeout) && timeout > 0 ? timeout : TIMEOUT_SEC,
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `specty wait`: passively polls until the active change is no longer waiting for the person,
 * then returns the card of `next`. While it waits, it keeps its mark (`store/waits.ts`).
 */
export async function wait(session: Session, options: WaitOptions = {}): Promise<Output> {
  const current = await resolveActive(session);
  if (current === undefined || !isWaitingForHuman(current)) {
    return withChangeLock(session, "next", () => next(session));
  }
  const { id } = current.state;
  const limits = parseWaitLimits(options);
  const started = Date.now();
  const mark = await markWait(session.git, id, {
    pid: process.pid,
    ...(session.tool !== undefined ? { tool: session.tool } : {}),
    since: new Date(started).toISOString(),
    ...limits,
  });
  const beat = heartbeat(session, id, limits, started, options.beatMs ?? BEAT_MS);
  while (true) {
    await sleep(limits.intervalMs);
    await mark.renew();
    if (Date.now() - started >= limits.timeoutSec * 1000) {
      await mark.end("timeout");
      return waitTimeoutCard(id, limits.timeoutSec, session.cards);
    }
    beat();
    if (await decided(session, id, mark)) {
      return withChangeLock(session, "next", () => next(session));
    }
  }
}

/** Whether the person decided on change `id`, ending its mark if so; not while a command changes it. */
async function decided(session: Session, id: string, mark: WaitMark): Promise<boolean> {
  if ((await liveHolder(session.git, id)) !== undefined) return false;
  const current = await resolveActive(session);
  if (current !== undefined && isWaitingForHuman(current)) return false;
  await mark.end("decided");
  return true;
}

/**
 * Writes the heartbeat line on stderr when the next look would leave it more than `beatMs` from
 * the last one, in a tool that needs it (`waitHeartbeat`).
 */
function heartbeat(
  session: Session,
  id: string,
  limits: WaitLimits,
  started: number,
  beatMs: number,
): () => void {
  let last = started;
  return () => {
    const now = Date.now();
    if (now + limits.intervalMs - last < beatMs) return;
    const line = waitHeartbeat(id, (now - started) / 1000, limits.timeoutSec, session.cards);
    if (line === undefined) return;
    session.environment.io.err(line);
    last = now;
  };
}
