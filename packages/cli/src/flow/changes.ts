// SPDX-License-Identifier: Apache-2.0
import { createGit, resolved } from "../io/git";
import { type Session, sessionFrom } from "../session";
import { listOpenChanges, type StoredChange } from "../store/changes";
import { loadConfig } from "../store/config";
import { readDelegation } from "../store/local";
import { repoPaths } from "../store/paths";
import { isFinished, resolveActive } from "./active";
import { integrationOf, isIncorporated } from "./integrate";

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

/** The decisions only a person takes, from any folder. */
export type PersonAction = "approve" | "reject" | "accept" | "close" | "cancel";

/**
 * Whether the change waits for the person's `action`: the spec's review, or with `scope` that
 * scope request; acceptance; a submitted closing, or a closed change that did not reach its
 * target branch; and, to cancel, any open change.
 */
export async function awaits(
  action: PersonAction,
  { change, session }: Located,
  scope: string | undefined,
): Promise<boolean> {
  const { state } = change;
  const requested =
    scope !== undefined && state.pending.scopeRequests.some((request) => request.id === scope);
  switch (action) {
    case "approve":
      return scope === undefined ? state.phase === "review" : requested;
    case "reject":
      return requested;
    case "accept":
      return state.phase === "acceptance";
    case "close":
      return awaitsClose(session, state);
    case "cancel":
      return !isFinished(state);
  }
}

/** A submitted closing, or a closed change that did not reach its target branch. */
async function awaitsClose(session: Session, state: StoredChange["state"]): Promise<boolean> {
  if (state.phase === "closing") return state.closingSubmittedAt !== undefined;
  if (state.phase !== "done") return false;
  const plan = await integrationOf(session, state);
  return plan !== undefined && !(await isIncorporated(session, plan));
}

/** A session in another worktree, as `openSession` opens it there; nothing when Specty is not set up. */
async function sessionIn(session: Session, folder: string): Promise<Session | undefined> {
  const paths = repoPaths(folder);
  const loaded = await loadConfig(paths);
  if (loaded.kind !== "ok") return undefined;
  const git = createGit(folder, session.environment.env);
  const delegated = (await readDelegation(git)) !== undefined;
  return sessionFrom(session.environment, folder, paths, git, loaded.config, delegated);
}
