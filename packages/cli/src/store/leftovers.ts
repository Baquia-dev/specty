// SPDX-License-Identifier: Apache-2.0
// What processes that died left in git's folders for Specty, which `specty prune` removes: the
// half-done writes (`writeText` and the locks write `<file>.<pid>.tmp`, then rename or link it)
// and the live runs (`runs.ts`) in the common folder, and the temporary indexes that `treeWith`
// (`io/git.ts`) reads the tree with, in the git folder of each worktree.
import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { remove } from "../io/files";
import type { Git } from "../io/git";
import { alive } from "./lock";
import { clearRun, readRuns } from "./runs";

/** A half-done write, `<file>.<pid>.tmp`, and the process writing it. */
const HALF_WRITE = /\.(\d+)\.tmp$/;

/**
 * Removes what processes that no longer exist left: their live runs and half-done writes in
 * Specty's common folder, and the temporary indexes over `hours` old (by `now`;
 * `internal.retention.indexHours`) in the `specty/` folder of every worktree's git folder, also of
 * one whose folder is gone: `treeWith` uses one for seconds, so an older one is no process's. Says
 * how many of each, and after how many hours.
 */
export async function removeLeftovers(
  git: Git,
  now: Date,
  hours: number,
): Promise<{
  readonly writes: number;
  readonly runs: number;
  readonly indexes: number;
  readonly hours: number;
}> {
  const runs = await removeDeadRuns(git);
  const writes = await removeHalfWrites(await git.gitPath("common/specty"));
  const common = dirname(await git.gitPath("common"));
  const indexes = await removeOldIndexes(common, now.getTime() - hours * 60 * 60 * 1000);
  return { writes, runs, indexes, hours };
}

/** The live runs of processes that no longer exist, as the UI's server already drops them. */
async function removeDeadRuns(git: Git): Promise<number> {
  const dead = [...(await readRuns(git))].filter(([, run]) => !alive(run.pid));
  await Promise.all(dead.map(([change]) => clearRun(git, change)));
  return dead.length;
}

/**
 * The half-done writes of processes that no longer exist, anywhere in `folder` but `backups/`,
 * whose copies keep the person's files as they were.
 */
async function removeHalfWrites(folder: string): Promise<number> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(
    (): Dirent[] => [],
  );
  const backups = `${join(folder, "backups")}${sep}`;
  const dead = entries.flatMap((entry) => {
    const pid = HALF_WRITE.exec(entry.name)?.[1];
    const path = join(entry.parentPath, entry.name);
    const gone = pid !== undefined && entry.isFile() && !alive(Number(pid));
    return gone && !path.startsWith(backups) ? [path] : [];
  });
  await Promise.all(dead.map(remove));
  return dead.length;
}

/**
 * The temporary indexes modified before `before`, in the git folder of the main worktree (the
 * common one) and in those of the others (`worktrees/<name>/`).
 */
async function removeOldIndexes(common: string, before: number): Promise<number> {
  const others = await readdir(join(common, "worktrees")).catch((): string[] => []);
  const folders = [common, ...others.map((name) => join(common, "worktrees", name))];
  const old = (
    await Promise.all(folders.map((folder) => oldIndexes(join(folder, "specty"), before)))
  ).flat();
  await Promise.all(old.map(remove));
  return old.length;
}

async function oldIndexes(folder: string, before: number): Promise<string[]> {
  const names = await readdir(folder).catch((): string[] => []);
  const old = await Promise.all(
    names
      .filter((name) => name.startsWith("index-"))
      .map(async (name) => {
        const path = join(folder, name);
        const modified = await stat(path).then(
          ({ mtimeMs }) => mtimeMs,
          () => Number.POSITIVE_INFINITY,
        );
        return modified < before ? [path] : [];
      }),
  );
  return old.flat();
}
