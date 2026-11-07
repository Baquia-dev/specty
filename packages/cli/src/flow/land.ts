// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative } from "node:path";
import {
  afterLandingLine,
  backOnTargetLine,
  folderRemovedLine,
  folderStaysLine,
  landedLine,
  landingNote,
  leaveFolderNext,
  notLandedLine,
  type Output,
  retryLandingNext,
  section,
  targetAheadLine,
} from "@baquia-dev/specty-core";
import { entersByName } from "../install/agents";
import { type ExecResult, execute, tail } from "../io/exec";
import { resolved } from "../io/git";
import type { Session } from "../session";
import { returnToEpic } from "./epic";
import { findChange } from "./find";
import { absorbTarget, contains, type Integration, reasonOf } from "./integrate";

export interface Landed {
  /** The main branch now contains the change. */
  readonly landed: boolean;
  readonly lines: readonly string[];
  /**
   * The agent that closed works inside the change's folder, removed or not: it must leave it, for
   * the epic when the change was a slice its conversation carried.
   */
  readonly left?: Parameters<typeof leaveFolderNext>[0];
}

/**
 * Fast-forwards the main branch to the change, where it is checked out, and then leaves the
 * change's folder: a worktree of its own is removed at once (its branch stays), also when whoever
 * closes works inside it; the main folder goes back to the main branch. Reports failures instead
 * of throwing: the change is already closed.
 */
async function landChange(session: Session, plan: Integration): Promise<Landed> {
  const { git, lang } = session;
  const tip = await git.output(["rev-parse", "HEAD"]);
  const failure =
    plan.holder === undefined
      ? await advanceRef(session, plan.target, tip)
      : failureOf(await git.run(["-C", plan.holder, "merge", "--ff-only", "-q", plan.branch]));
  if (failure !== undefined) {
    return { landed: false, lines: [notLandedLine(plan.target, failure, lang)] };
  }
  const lines = [landedLine(plan.target, lang)];
  if (plan.inMain) return landedInMain(session, plan, lines);
  lines.push(...(await afterLanding(session, plan.holder)));
  // Its work is in the target now: the folder goes, even from under whoever closed in it.
  const folder = await leaveChangeFolder(session, plan);
  lines.push(folder.line);
  return { landed: true, lines, ...(folder.left === undefined ? {} : { left: folder.left }) };
}

/** The change's own folder once its command is done with it: the card's line, and how the agent leaves. */
export interface FolderLeft {
  readonly line: string;
  readonly left?: Landed["left"];
}

/**
 * Removes the change's own folder from the main one, without `--force` (its branch stays), also
 * from under whoever works inside it, unless `stays` says why it must stay. An agent's session
 * (delegated mode) inside it must then leave it, back to its epic after a slice its conversation
 * carried; a person reads where to carry on.
 */
export async function leaveChangeFolder(
  session: Session,
  change: ChangeFolder,
  stays?: string,
): Promise<FolderLeft> {
  const { git } = session;
  const inside = session.actor === "agent" && (await within(session.environment.cwd, git.root));
  // The slice's spec is read before its folder goes: the conversation goes back to its epic.
  const epic = inside ? await returnToEpic(session, change.id, git.root) : undefined;
  const { line, removed } =
    stays === undefined ? await removeFolder(session, change) : { line: stays, removed: false };
  if (!inside) return { line };
  const left = {
    folder: git.root,
    main: change.main,
    removed,
    ...(epic === undefined ? {} : { epic: { ...epic, byName: await entersByName(change.main) } }),
  };
  return { line, left };
}

/** The change whose own folder is `session`'s, its branch, and the main folder. */
interface ChangeFolder {
  readonly id: string;
  readonly branch: string;
  readonly main: string;
}

/** `git worktree remove` of the change's folder, and the card's line: removed, or git's reason. */
async function removeFolder(
  session: Session,
  change: ChangeFolder,
): Promise<{ readonly line: string; readonly removed: boolean }> {
  const { git, lang } = session;
  const removed = await git.run(["-C", change.main, "worktree", "remove", git.root]);
  return removed.code === 0
    ? { line: folderRemovedLine(git.root, change.branch, change.main, lang), removed: true }
    : { line: folderStaysLine(git.root, reasonOf(removed), lang), removed: false };
}

/** The change lived in the main folder: it goes back to the target branch, and what follows runs. */
async function landedInMain(
  session: Session,
  plan: Integration,
  lines: readonly string[],
): Promise<Landed> {
  const back =
    plan.holder === undefined && (await session.git.run(["switch", "-q", plan.target])).code === 0;
  const done = back ? [...lines, backOnTargetLine(plan.target, session.lang)] : lines;
  const folder = plan.holder ?? (back ? plan.main : undefined);
  return { landed: true, lines: [...done, ...(await afterLanding(session, folder))] };
}

/**
 * Runs `git.afterLanding`, when set, in `folder`, the one that holds the target branch now that the
 * change landed there; nothing without one. Its line says how it ended: the change stays landed.
 */
async function afterLanding(session: Session, folder: string | undefined): Promise<string[]> {
  const command = session.config.git.afterLanding;
  if (command === undefined || folder === undefined) return [];
  session.environment.io.err(landingNote(command, session.lang));
  const result = await execute(command, [], {
    cwd: folder,
    shell: true,
    env: session.environment.env,
    timeoutMs: session.config.verify.timeoutSec * 1000,
  });
  const ok = result.code === 0;
  const last = ok ? undefined : tail(result, 1)[0];
  return [
    afterLandingLine(
      { command, folder, ok, ...(last !== undefined ? { last } : {}) },
      session.lang,
    ),
  ];
}

/**
 * Lands the change; when main moved meanwhile (the change's branch, with main incorporated, no
 * longer contains it), does what running `specty close` again would: incorporates main once more,
 * with its verification, and lands, up to `internal.retries.landing` more times. Those
 * incorporations' lines go before the last landing's.
 */
export async function landRetrying(session: Session, plan: Integration): Promise<Landed> {
  let landed = await landChange(session, plan);
  const lines: string[] = [];
  const retries = session.config.internal.retries.landing;
  for (let retry = 0; retry < retries && !landed.landed; retry++) {
    if (await contains(session.git, "HEAD", plan.target)) break;
    const change = await findChange(session, plan.id);
    if (change === undefined) break;
    const absorbed = await absorbTarget(session, plan, change, "close");
    if (!absorbed.ok) break;
    lines.push(...absorbed.lines);
    landed = await landChange(session, plan);
  }
  return { ...landed, lines: [...lines, ...landed.lines] };
}

/** The closing card plus what the incorporation did; if the main branch did not move, how to retry. */
export function withIntegration(
  session: Session,
  card: Output,
  before: readonly string[],
  landed: Landed | undefined,
): Output {
  if (landed === undefined) return card;
  const blocks = [...card.blocks, ...section(undefined, [...before, ...landed.lines])];
  if (!landed.landed) return { ...card, blocks, next: retryLandingNext(session.cards) };
  if (landed.left === undefined) return { ...card, blocks };
  return { ...card, blocks, next: leaveFolderNext(landed.left, session.cards) };
}

/** True when `path` is `folder` or lies inside it, with symbolic links resolved. */
export async function within(path: string, folder: string): Promise<boolean> {
  const inner = relative(await resolved(folder), await resolved(path));
  return !inner.startsWith("..") && !isAbsolute(inner);
}

/**
 * Moves `branch`, checked out nowhere, to `tip`: only as a fast-forward, and only if nobody moved
 * it meanwhile. Returns why it did not, or undefined.
 */
async function advanceRef(
  session: Session,
  branch: string,
  tip: string,
): Promise<string | undefined> {
  const ref = `refs/heads/${branch}`;
  const old = await session.git.output(["rev-parse", ref]);
  if (!(await contains(session.git, tip, old))) return targetAheadLine(session.lang);
  return failureOf(await session.git.run(["update-ref", ref, tip, old]));
}

function failureOf(result: ExecResult): string | undefined {
  return result.code === 0 ? undefined : reasonOf(result);
}
