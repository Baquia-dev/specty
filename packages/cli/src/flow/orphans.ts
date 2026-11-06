// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { type Lang, notInTargetFolderLine, workingFolderLine } from "@baquia-dev/specty-core";
import { exists } from "../io/files";
import { type Git, resolved } from "../io/git";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { readBindings } from "../store/local";
import { repoPaths } from "../store/paths";
import { isFinished } from "./active";
import { locateChanges } from "./changes";
import { integrationOf, isIncorporated } from "./integrate";
import { within } from "./land";
import { lostChanges } from "./lost";
import { formerWorktreesHome, ghostFolders, worktreesHome } from "./worktree";

// The orphans the clean-up removes (ARCHITECTURE §9), one finder for each kind: records of
// worktrees whose folder is gone, folders of finished changes, ghost folders, and folders of
// `.specty/changes/` with no file. Finding them touches nothing: `doctor` and `status` count them.

/**
 * A session's record stops counting a day after it was made, or once its tool said the
 * conversation ended (`ended`): nothing deletes it at the end.
 */
const SESSION_DAY = 24 * 60 * 60 * 1000;

/** How many orphans of each kind the clean-up would remove, run from the same folder. */
export interface OrphanCounts {
  readonly records: number;
  readonly finished: number;
  readonly ghosts: number;
  readonly empty: number;
}

/** Counts the orphans of each kind that `cleanUp` would remove from this folder, touching none. */
export async function countOrphans(session: Session): Promise<OrphanCounts> {
  const { git } = session;
  const finished = (await finishedFolders(session)).filter(({ kept }) => kept === undefined);
  const ghosts = await sweepableGhosts(session);
  // The clean-up spares the one this process runs in.
  const inside = await Promise.all(ghosts.map((folder) => within(session.environment.cwd, folder)));
  return {
    records: await staleRecords(git),
    finished: finished.length,
    ghosts: inside.filter((here) => !here).length,
    empty: (await emptyChangeFolders(git)).length,
  };
}

/**
 * How many records of worktrees git keeps whose folder no longer exists, but the locked ones,
 * which `git worktree prune` keeps.
 */
export async function staleRecords(git: Git): Promise<number> {
  // The main one comes first, and it is where git runs.
  const [, ...others] = await git.worktrees();
  const unlocked = others.filter(({ locked }) => locked !== true);
  const present = await Promise.all(unlocked.map(({ folder }) => exists(folder)));
  return present.filter((here) => !here).length;
}

/** The worktree of a finished change, and why it stays, when it does. */
export interface FinishedFolder {
  readonly there: Session;
  readonly kept?: string;
}

/**
 * The worktrees of finished changes, closed or cancelled, but the main folder and the one this
 * process runs in: each with why it stays (`keptBecause`), or none when the clean-up removes it.
 */
export async function finishedFolders(session: Session): Promise<FinishedFolder[]> {
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const working = await workingFolders(session);
  const found: FinishedFolder[] = [];
  for (const { change, session: there } of await locateChanges(session)) {
    const { state } = change;
    if (!isFinished(state) || there.root === main) continue;
    if (await within(session.environment.cwd, there.root)) continue;
    const kept = await keptBecause(there, state, working, session.lang);
    found.push(kept === undefined ? { there } : { there, kept });
  }
  return found;
}

/**
 * The folders agent sessions work in, as the guard recorded them in the last day, resolved; not
 * those of conversations their tool said ended.
 */
export async function workingFolders(session: Session): Promise<string[]> {
  const now = session.environment.now().getTime();
  return Promise.all(
    (await readBindings(session.git))
      .filter(({ at, ended }) => ended === undefined && now - Date.parse(at) < SESSION_DAY)
      .map(({ folder }) => resolved(folder)),
  );
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
 * The ghost folders the clean-up sweeps: the subfolders of `.worktrees/` and of the sibling folder
 * from before ADR 0018 that git does not list as worktrees (`ghostFolders`), but not those that
 * hold a git repository of their own, which are not Specty's, nor those named after an open change
 * that lost its folder, which `specty restore` brings back.
 */
export async function sweepableGhosts(session: Session): Promise<string[]> {
  const { git } = session;
  const homes = [await worktreesHome(git), await formerWorktreesHome(git)];
  const entries = (await Promise.all(homes.map(subfolders))).flat();
  if (entries.length === 0) return [];
  // Git's list is asked after the folders are read, and afresh: `git worktree add` lists a folder
  // before it writes any file in it, so one it makes meanwhile is no ghost.
  git.forget();
  const ghostOf = await ghostFolders(git);
  const ghosts: string[] = [];
  for (const folder of entries) {
    if (ghostOf(folder) === folder && !(await ownRepository(folder))) ghosts.push(folder);
  }
  if (ghosts.length === 0) return [];
  const lost = new Set((await lostChanges(session)).map(({ id }) => id));
  return ghosts.filter((folder) => !lost.has(basename(folder)));
}

/** The folders of `.specty/changes/` that hold no file, in the main folder and in each worktree. */
export async function emptyChangeFolders(git: Git): Promise<string[]> {
  const found: string[] = [];
  for (const { folder } of await git.worktrees()) {
    for (const change of await subfolders(repoPaths(folder).changes)) {
      if (!(await holdsFiles(change))) found.push(change);
    }
  }
  return found;
}

/** The subfolders of `folder`, neither its files nor its links; none when it does not exist. */
async function subfolders(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(folder, entry.name));
}

/** Whether `folder`, or a folder inside it, holds anything but folders; one it cannot read, too. */
async function holdsFiles(folder: string): Promise<boolean> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => undefined);
  if (entries === undefined) return true;
  for (const entry of entries) {
    if (!entry.isDirectory() || (await holdsFiles(join(folder, entry.name)))) return true;
  }
  return false;
}

/**
 * Whether `folder` holds a git repository of its own: a `.git` folder, or a `.git` file whose git
 * folder exists.
 */
async function ownRepository(folder: string): Promise<boolean> {
  const dotGit = join(folder, ".git");
  const found = await stat(dotGit).catch(() => undefined);
  if (found === undefined) return false;
  if (found.isDirectory()) return true;
  const text = await readFile(dotGit, "utf8").catch(() => "");
  const pointed = /^gitdir:\s*(.+)$/m.exec(text)?.[1]?.trim();
  return pointed !== undefined && (await exists(resolve(folder, pointed)));
}
