// SPDX-License-Identifier: Apache-2.0
import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { type ForeignPath, preparingNote } from "@baquia-dev/specty-core";
import { setupCommand } from "../detect/project";
import { detectStacks } from "../detect/stack";
import { AGENT_HOOK_FILES } from "../install/agents";
import { execute, tail } from "../io/exec";
import { exists } from "../io/files";
import { type Git, resolved, type Worktree } from "../io/git";
import type { Session } from "../session";

export interface ParallelBase {
  /** What the person named, or the branch Specty chose. */
  readonly name: string;
  /** Undefined when `name` is neither a branch nor a commit. */
  readonly commit: string | undefined;
}

/**
 * Where a change in a new worktree starts: `from`, else `git.target` (`target`), else the main
 * branch, else HEAD. Not the current branch, so that a parallel change never inherits another
 * one's unmerged work.
 */
export async function parallelBase(
  git: Git,
  from: string | undefined,
  target?: string,
): Promise<ParallelBase> {
  const name = from ?? target ?? (await mainBranch(git)) ?? "HEAD";
  const result = await git.run(["rev-parse", "--verify", "-q", `${name}^{commit}`]);
  return { name, commit: result.code === 0 ? result.stdout.trim() : undefined };
}

/**
 * The branch finished changes go to: `git.target` (`configured`) when set, or nothing if that
 * branch does not exist, so a change never lands on a branch nobody chose; unset, the main branch.
 */
export async function targetBranch(
  git: Git,
  configured: string | undefined,
): Promise<string | undefined> {
  if (configured === undefined) return mainBranch(git);
  const local = await git.run(["rev-parse", "--verify", "-q", `refs/heads/${configured}`]);
  return local.code === 0 ? configured : undefined;
}

/** The remote's default branch, or else the first local one of `init.defaultBranch`, `main`, `master`. */
async function mainBranch(git: Git): Promise<string | undefined> {
  const remote = await git.run(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const candidates = [
    remote.code === 0 ? remote.stdout.trim().replace(/^origin\//, "") : undefined,
    await git.config("init.defaultBranch"),
    "main",
    "master",
  ];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const local = await git.run(["rev-parse", "--verify", "-q", `refs/heads/${candidate}`]);
    if (local.code === 0) return candidate;
  }
  return undefined;
}

/** `<main folder>.worktrees`, beside the main worktree: never inside a repository. */
export async function worktreesHome(git: Git): Promise<string> {
  const main = (await git.worktrees())[0]?.folder ?? git.root;
  return join(dirname(main), `${basename(main)}.worktrees`);
}

export interface PlacedPaths {
  /** Repository-relative paths inside this worktree. */
  readonly inside: readonly string[];
  /** Paths inside another worktree of the repository. */
  readonly foreign: readonly ForeignPath[];
}

/**
 * Sorts absolute paths by the worktree that contains them most closely, so a worktree nested in
 * another owns its files. This one is recognized by its real path and wins ties. Paths outside
 * every worktree are dropped.
 */
export async function placePaths(git: Git, paths: readonly string[]): Promise<PlacedPaths> {
  if (paths.length === 0) return { inside: [], foreign: [] };
  const own = await resolved(git.root);
  const listed = await git.worktrees();
  const isOwn = await Promise.all(
    listed.map(async ({ folder }) => (await resolved(folder)) === own),
  );
  const self: Worktree = { folder: git.root };
  const owners = [self, ...listed.filter((_, index) => !isOwn[index])];
  const placed = paths.flatMap((path) => {
    const owner = closest(owners, path);
    return owner === undefined ? [] : [{ path, owner }];
  });
  return {
    inside: placed
      .filter(({ owner }) => owner === self)
      .map(({ path }) => relative(git.root, path).split(sep).join("/")),
    foreign: placed.flatMap(({ path, owner }): ForeignPath[] =>
      owner === self
        ? []
        : [
            {
              path,
              worktree: owner.folder,
              ...(owner.branch !== undefined ? { branch: owner.branch } : {}),
            },
          ],
    ),
  };
}

/** The worktree whose folder contains `path` most closely; the first one wins ties. */
function closest(owners: readonly Worktree[], path: string): Worktree | undefined {
  return owners
    .filter(({ folder }) => {
      const inner = relative(folder, path);
      return !inner.startsWith("..") && !isAbsolute(inner);
    })
    .reduce<Worktree | undefined>(
      (best, owner) =>
        best === undefined || owner.folder.length > best.folder.length ? owner : best,
      undefined,
    );
}

export interface Prepared {
  readonly command: string;
  readonly ok: boolean;
  /** The end of what it printed. */
  readonly output: readonly string[];
}

/**
 * Prepares a new worktree, usually installing its dependencies: runs `git.setup` there or, when it
 * is unset, the install command of the stack detected in the folder. Undefined when nothing runs.
 */
export async function prepareWorktree(
  session: Session,
  folder: string,
): Promise<Prepared | undefined> {
  const { setup } = session.config.git;
  if (setup === false) return undefined;
  const command =
    setup ?? (await detectStacks(folder)).map(setupCommand).find((found) => found !== undefined);
  if (command === undefined) return undefined;
  session.environment.io.err(preparingNote(command, session.lang));
  const result = await execute(command, [], {
    cwd: folder,
    shell: true,
    env: session.environment.env,
    timeoutMs: session.config.verify.timeoutSec * 1000,
  });
  return { command, ok: result.code === 0, output: tail(result, 15) };
}

/**
 * Checks `branch` out from `base` in a new worktree, and copies there the agent hook files that
 * git does not track: the versioned ones arrive with the branch. Returns the copied files.
 */
export async function addWorktree(
  git: Git,
  target: { readonly folder: string; readonly branch: string; readonly base: string },
): Promise<string[]> {
  await git.output(["worktree", "add", "-q", "-b", target.branch, target.folder, target.base]);
  const copied: string[] = [];
  for (const file of AGENT_HOOK_FILES) {
    if (!(await exists(join(git.root, file))) || (await git.isTracked(file))) continue;
    await mkdir(dirname(join(target.folder, file)), { recursive: true });
    await copyFile(join(git.root, file), join(target.folder, file));
    copied.push(file);
  }
  return copied;
}
