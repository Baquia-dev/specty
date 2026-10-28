// SPDX-License-Identifier: Apache-2.0
import {
  type Lang,
  notInTargetBranchLine,
  notInTargetFolderLine,
  workingFolderLine,
} from "@baquia-dev/specty-core";
import { resolved } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { readBindings } from "../store/local";
import { isFinished } from "./active";
import { markedBranches } from "./branches";
import { locateChanges } from "./changes";
import { integrationOf, isIncorporated, reasonOf } from "./integrate";
import { within } from "./land";
import { targetBranch } from "./worktree";

export interface Cleanup {
  readonly removed: readonly string[];
  /** What stays, each with why. */
  readonly kept: readonly string[];
}

/** A session's record stops counting a day after it was made: nothing deletes it at the end. */
const SESSION_DAY = 24 * 60 * 60 * 1000;

/**
 * Removes the worktrees of finished changes that no longer need one: closed and already in their
 * target branch (or not meant to be incorporated), or cancelled. Never the folder this process
 * runs in, nor one an agent session works in (as the guard recorded it), nor the main folder.
 * The branches stay.
 */
export async function removeFinished(session: Session): Promise<Cleanup> {
  const { lang } = session;
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const now = session.environment.now().getTime();
  const working = await Promise.all(
    (await readBindings(session.git))
      .filter(({ at }) => now - Date.parse(at) < SESSION_DAY)
      .map(({ folder }) => resolved(folder)),
  );
  const removed: string[] = [];
  const kept: string[] = [];
  for (const { change, session: there } of await locateChanges(session)) {
    const { state } = change;
    if (!isFinished(state) || there.root === main) continue;
    if (await within(session.environment.cwd, there.root)) continue;
    const reason = await keptBecause(there, state, working, lang);
    if (reason !== undefined) {
      kept.push(reason);
      continue;
    }
    const result = await session.git.run(["-C", main, "worktree", "remove", there.root]);
    if (result.code === 0) removed.push(there.root);
    else kept.push(`${there.root}: ${reasonOf(result)}`);
  }
  return { removed, kept };
}

/** Why a finished change's folder stays: an agent session works in it, or it is not in its target. */
async function keptBecause(
  there: Session,
  state: StoredChange["state"],
  working: readonly string[],
  lang: Lang,
): Promise<string | undefined> {
  // Such as the session that closed its change from inside, in delegated mode.
  if (working.includes(await resolved(there.root))) return workingFolderLine(there.root, lang);
  const plan = state.phase === "done" ? await integrationOf(there, state) : undefined;
  if (plan !== undefined && !(await isIncorporated(there, plan))) {
    return notInTargetFolderLine(there.root, state.id, plan.target, lang);
  }
  return undefined;
}

/**
 * Deletes the change branches (`specty/*`, `spike/*` and those `new` marked, whatever `git.flow`
 * named them) that are already in the target branch and checked out in no worktree: their
 * commits are in the target, so nothing is lost. The others stay, such as a cancelled change's,
 * which keeps its record. A branch Specty did not create never goes, even one named by the flow.
 */
export async function deleteMerged(session: Session): Promise<Cleanup> {
  const { git } = session;
  const target = await targetBranch(git, session.config.git.target);
  if (target === undefined) return { removed: [], kept: [] };
  const patterns = ["specty/*", "spike/*", ...(await markedBranches(git))];
  const branches = async (filter: "--merged" | "--no-merged") =>
    (
      await git.output([
        "branch",
        filter,
        target,
        "--format=%(refname:short)",
        "--list",
        ...patterns,
      ])
    )
      .split("\n")
      .map((branch) => branch.trim())
      .filter((branch) => branch.length > 0);
  const inUse = new Set((await git.worktrees()).flatMap(({ branch }) => branch ?? []));
  const removed: string[] = [];
  for (const branch of (await branches("--merged")).filter((name) => !inUse.has(name))) {
    if ((await git.run(["branch", "-D", branch])).code === 0) removed.push(branch);
  }
  const kept = (await branches("--no-merged")).map((branch) =>
    notInTargetBranchLine(branch, target, session.lang),
  );
  return { removed, kept };
}
