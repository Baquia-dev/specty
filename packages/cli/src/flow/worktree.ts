// SPDX-License-Identifier: Apache-2.0
import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { AGENT_HOOK_FILES } from "../install/agents";
import { exists } from "../io/files";
import type { Git } from "../io/git";

export interface ParallelBase {
  /** What the person named, or the branch Specty chose. */
  readonly name: string;
  /** Undefined when `name` is neither a branch nor a commit. */
  readonly commit: string | undefined;
}

/**
 * Where a change in a new worktree starts: `from`, else the main branch, else HEAD. Not the
 * current branch, so that a parallel change never inherits another one's unmerged work.
 */
export async function parallelBase(git: Git, from: string | undefined): Promise<ParallelBase> {
  const name = from ?? (await mainBranch(git)) ?? "HEAD";
  const result = await git.run(["rev-parse", "--verify", "-q", `${name}^{commit}`]);
  return { name, commit: result.code === 0 ? result.stdout.trim() : undefined };
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
  const main = (await git.worktrees())[0] ?? git.root;
  return join(dirname(main), `${basename(main)}.worktrees`);
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
