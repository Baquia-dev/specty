// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  headerOf,
  type Output,
  type Phase,
  parseChangeState,
  scopeRequestedCard,
  unlocksApprovedTest,
  waitFolderGoneCard,
  waitHeartbeat,
  waitsForPerson,
  waitTimeoutCard,
} from "@baquia-dev/specty-core";
import { resolveActive, withChangeLock } from "../flow/active";
import { exists, parseJson } from "../io/files";
import { createGit, type Git } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { readDelegation } from "../store/local";
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
 * `internal.waits.waitTimeoutSec`: 55 min by default, within the hour every tool measured holds,
 * so that the agent wakes up while its prompt cache, which lasts an hour, is still alive.
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
 * (`changeWaitsFor`): the end of the agent's turn and the guard's brake on `sleep` read it too,
 * and their cards tell the agent to decide in delegated mode. `wait` passes `delegated`, which
 * leaves only what no delegation covers (`waitsForPerson`).
 */
export function isWaitingForHuman(change: StoredChange, delegated = false): boolean {
  return waitsForPerson(change.state, delegated);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `specty wait`: passively polls until the active change is no longer waiting for the person,
 * then returns the card of `next`. While it waits, it keeps its mark (`store/waits.ts`). In
 * delegated mode it does not wait for a decision the agent takes for the person, and the person
 * may turn the mode on or off meanwhile: each look reads it again.
 */
export async function wait(session: Session, options: WaitOptions = {}): Promise<Output> {
  const current = await resolveActive(session);
  if (current === undefined || !isWaitingForHuman(current, session.delegated)) {
    return answer(session);
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
    const now = await withDelegation(session);
    if (Date.now() - started >= limits.timeoutSec * 1000) {
      await mark.end("timeout");
      return waitTimeoutCard(id, limits.timeoutSec, now.cards);
    }
    beat();
    if (await decided(now, id, mark)) return afterDecision(now, current.state, main);
  }
}

/**
 * The session with delegated mode as the person left it now, which they may switch while `wait`
 * waits: who decides, for `wait`, `next` and the cards, follows it. The terminal stays the one
 * `wait` opened with, since neither `next` nor the cards ask it anything.
 */
async function withDelegation(session: Session): Promise<Session> {
  const delegated = (await readDelegation(session.git)) !== undefined;
  if (delegated === session.delegated) return session;
  return { ...session, delegated, cards: { ...session.cards, delegated } };
}

/**
 * The card once nothing waits for the person: `next`'s, which in delegated mode tells the agent to
 * decide. In delegated mode, a scope request the agent decides gets its card as `scope add` gives
 * it, which says so, since `next`'s, the task's, only lists it.
 */
async function answer(session: Session): Promise<Output> {
  const active = session.delegated ? await resolveActive(session) : undefined;
  if (active !== undefined) {
    const { state } = active;
    const ours = state.pending.scopeRequests.find((entry) => !unlocksApprovedTest(entry, state));
    if (ours !== undefined) {
      const header = headerOf(state.id, state.phase);
      return scopeRequestedCard(header, ours.id, ours.paths, session.cards);
    }
  }
  return withChangeLock(session, "next", () => next(session));
}

/**
 * The card once the person decided: `next`'s, or, when the change's folder went meanwhile, as
 * closing it does, what happened. Git no longer runs there, so the change's end is read in the
 * main folder, at the tip of its branch.
 */
async function afterDecision(session: Session, state: ChangeState, main: string): Promise<Output> {
  if (await exists(session.root)) return answer(session);
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

/**
 * Whether the person decided on change `id`, or turned delegated mode on with a decision the agent
 * takes, ending its mark if so (`decided`); not while a command changes it.
 */
async function decided(session: Session, id: string, mark: WaitMark): Promise<boolean> {
  if ((await liveHolder(session.git, id)) !== undefined) return false;
  const current = await resolveActive(session);
  if (current !== undefined && isWaitingForHuman(current, session.delegated)) return false;
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
