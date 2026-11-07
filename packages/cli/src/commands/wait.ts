// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  changeWaitsFor,
  type Output,
  type Phase,
  parseChangeState,
  waitFolderGoneCard,
  waitHeartbeat,
  waitTimeoutCard,
} from "@baquia-dev/specty-core";
import { resolveActive, withChangeLock } from "../flow/active";
import { exists, parseJson } from "../io/files";
import { createGit, type Git } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { liveHolder } from "../store/lock";
import { SPECTY_DIR } from "../store/paths";
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
 * Parses timeout and polling interval options safely. Without `--timeout`, `wait` waits
 * `internal.waits.waitTimeoutSec` (an hour by default, what every tool measured holds).
 */
function parseWaitLimits(options: WaitOptions, timeoutSec: number): WaitLimits {
  const timeout = Number(options.timeout);
  const interval = Number(options.interval);
  return {
    timeoutSec: Number.isFinite(timeout) && timeout > 0 ? timeout : timeoutSec,
    intervalMs: Number.isFinite(interval) && interval > 0 ? interval : 500,
  };
}

/**
 * Checks whether the active change is waiting for a person's decision or action, by core's rule
 * (`changeWaitsFor`): the end of the agent's turn and the guard's brake on `sleep` read it too.
 */
export function isWaitingForHuman(change: StoredChange): boolean {
  return changeWaitsFor(change.state) === "human";
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
  // Asked while the change's folder is there: closing the change removes it from under `wait`.
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const { waitTimeoutSec, heartbeatSec } = session.config.internal.waits;
  const limits = parseWaitLimits(options, waitTimeoutSec);
  const started = Date.now();
  const mark = await markWait(session.git, id, {
    pid: process.pid,
    ...(session.tool !== undefined ? { tool: session.tool } : {}),
    since: new Date(started).toISOString(),
    ...limits,
  });
  // Gemini CLI cuts a command that writes nothing for 300 s: `heartbeatSec` is a minute by default.
  const beat = heartbeat(session, id, limits, started, options.beatMs ?? heartbeatSec * 1000);
  while (true) {
    await sleep(limits.intervalMs);
    await mark.renew();
    if (Date.now() - started >= limits.timeoutSec * 1000) {
      await mark.end("timeout");
      return waitTimeoutCard(id, limits.timeoutSec, session.cards);
    }
    beat();
    if (await decided(session, id, mark)) return afterDecision(session, current.state, main);
  }
}

/**
 * The card once the person decided: `next`'s, or, when the change's folder went meanwhile, as
 * closing it does, what happened. Git no longer runs there, so the change's end is read in the
 * main folder, at the tip of its branch.
 */
async function afterDecision(session: Session, state: ChangeState, main: string): Promise<Output> {
  if (await exists(session.root)) return withChangeLock(session, "next", () => next(session));
  const git = createGit(main, session.environment.env);
  const phase = state.branch === undefined ? undefined : await phaseAt(git, state.id, state.branch);
  const gone = { id: state.id, folder: session.root, main };
  return waitFolderGoneCard(phase === undefined ? gone : { ...gone, phase }, session.cards);
}

/** The phase of change `id` at the tip of `branch`: archived once closed or cancelled, or open. */
async function phaseAt(git: Git, id: string, branch: string): Promise<Phase | undefined> {
  const ref = `refs/heads/${branch}`;
  // `ls-tree` takes no wildcards, and the archive's year is the closing's: it lists them all.
  const where = [`${SPECTY_DIR}/archive`, `${SPECTY_DIR}/changes`];
  const listed = await git.run(["ls-tree", "-r", "--name-only", ref, "--", ...where]);
  const path = listed.stdout.split("\n").find((line) => line.endsWith(`/${id}/state.json`));
  if (path === undefined) return undefined;
  const parsed = parseChangeState(parseJson((await git.run(["show", `${ref}:${path}`])).stdout));
  return parsed.ok ? parsed.state.phase : undefined;
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
