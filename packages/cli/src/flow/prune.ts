// SPDX-License-Identifier: Apache-2.0
import { translator } from "@baquia-dev/specty-core";
import { resolved } from "../io/git";
import type { Session } from "../session";
import { readBindings } from "../store/local";
import { isFinished } from "./active";
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
  const t = translator(session.lang);
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
    // Such as the session that closed its change from inside, in delegated mode.
    if (working.includes(await resolved(there.root))) {
      kept.push(
        t(
          `${there.root}: una sesión de agente trabaja en ella.`,
          `${there.root}: an agent session works in it.`,
        ),
      );
      continue;
    }
    const plan = state.phase === "done" ? await integrationOf(there, state) : undefined;
    if (plan !== undefined && !(await isIncorporated(there, plan))) {
      kept.push(
        t(
          `${there.root}: ${state.id} aún no está en ${plan.target}.`,
          `${there.root}: ${state.id} is not in ${plan.target} yet.`,
        ),
      );
      continue;
    }
    const result = await session.git.run(["-C", main, "worktree", "remove", there.root]);
    if (result.code === 0) removed.push(there.root);
    else kept.push(`${there.root}: ${reasonOf(result)}`);
  }
  return { removed, kept };
}

/**
 * Deletes the change branches (`specty/*`, `spike/*`) that are already in the target branch and
 * checked out in no worktree: their commits are in the target, so nothing is lost. The others
 * stay, such as a cancelled change's, which keeps its record.
 */
export async function deleteMerged(session: Session): Promise<Cleanup> {
  const t = translator(session.lang);
  const { git } = session;
  const target = await targetBranch(git, session.config.git.target);
  if (target === undefined) return { removed: [], kept: [] };
  const branches = async (filter: "--merged" | "--no-merged") =>
    (
      await git.output([
        "branch",
        filter,
        target,
        "--format=%(refname:short)",
        "--list",
        "specty/*",
        "spike/*",
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
    t(`${branch}: no está en ${target}.`, `${branch}: not in ${target}.`),
  );
  return { removed, kept };
}
