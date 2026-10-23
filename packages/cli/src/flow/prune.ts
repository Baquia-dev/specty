// SPDX-License-Identifier: Apache-2.0
import { translator } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { isFinished } from "./active";
import { locateChanges } from "./changes";
import { integrationOf, isIncorporated, reasonOf } from "./integrate";
import { within } from "./land";

export interface Cleanup {
  readonly removed: readonly string[];
  /** What stays, each with why. */
  readonly kept: readonly string[];
}

/**
 * Removes the worktrees of finished changes that no longer need one: closed and already in their
 * target branch (or not meant to be incorporated), or cancelled. Never the folder this process
 * runs in, which may be an agent's session, nor the main folder. The branches stay.
 */
export async function removeFinished(session: Session): Promise<Cleanup> {
  const t = translator(session.lang);
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const removed: string[] = [];
  const kept: string[] = [];
  for (const { change, session: there } of await locateChanges(session)) {
    const { state } = change;
    if (!isFinished(state) || there.root === main) continue;
    if (await within(session.environment.cwd, there.root)) continue;
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
