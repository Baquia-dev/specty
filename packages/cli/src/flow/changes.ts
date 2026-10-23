// SPDX-License-Identifier: Apache-2.0
import { createGit, resolved } from "../io/git";
import { type Session, sessionFrom } from "../session";
import { listOpenChanges, type StoredChange } from "../store/changes";
import { loadConfig } from "../store/config";
import { repoPaths } from "../store/paths";
import { resolveActive } from "./active";

/** A change and a session in the folder it lives in. */
export interface Located {
  readonly change: StoredChange;
  /** A session in the change's folder, with that folder's configuration. */
  readonly session: Session;
  /** The change of the folder the command runs in. */
  readonly current: boolean;
}

/**
 * The change of every worktree, in any phase, each with a session in its own folder, plus this
 * folder's open changes without a branch of their own (`git.branchPerChange: false`). A change
 * another branch inherited is left out: its real state lives in its own worktree.
 */
export async function locateChanges(session: Session): Promise<Located[]> {
  const own = await resolved(session.root);
  const located: Located[] = [];
  for (const { folder } of await session.git.worktrees()) {
    const current = (await resolved(folder)) === own;
    const there = current ? session : await sessionIn(session, folder);
    const change = there === undefined ? undefined : await resolveActive(there);
    if (there !== undefined && change !== undefined)
      located.push({ change, session: there, current });
  }
  const found = new Set(located.map(({ change }) => change.state.id));
  for (const change of await listOpenChanges(session.paths)) {
    if (change.state.branch === undefined && !found.has(change.state.id))
      located.push({ change, session, current: false });
  }
  return located;
}

/** A session in another worktree, or nothing when Specty is not set up there. */
async function sessionIn(session: Session, folder: string): Promise<Session | undefined> {
  const paths = repoPaths(folder);
  const loaded = await loadConfig(paths);
  if (loaded.kind !== "ok") return undefined;
  const git = createGit(folder, session.environment.env);
  return sessionFrom(session.environment, folder, paths, git, loaded.config);
}
