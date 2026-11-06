// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { exists } from "../io/files";
import type { Git } from "../io/git";
import type { Session } from "../session";
import { repoPaths } from "../store/paths";
import { lostChanges } from "./lost";
import { formerWorktreesHome, ghostFolders, worktreesHome } from "./worktree";

// The orphans the clean-up removes (ARCHITECTURE §9), one finder for each kind: records of
// worktrees whose folder is gone, ghost folders, and folders of `.specty/changes/` with no file.

/** How many records of worktrees git keeps whose folder no longer exists, locked ones too. */
export async function staleRecords(git: Git): Promise<number> {
  // The main one comes first, and it is where git runs.
  const [, ...others] = await git.worktrees();
  const present = await Promise.all(others.map(({ folder }) => exists(folder)));
  return present.filter((here) => !here).length;
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
