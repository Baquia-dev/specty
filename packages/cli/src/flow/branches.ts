// SPDX-License-Identifier: Apache-2.0
import type { Git } from "../io/git";

/**
 * `name`, or the first of `name-2`, `name-3`… that no branch here nor in a remote uses: a
 * change never takes over a branch it did not create.
 */
export async function freeBranch(git: Git, name: string, attempt = 1): Promise<string> {
  const candidate = attempt === 1 ? name : `${name}-${attempt}`;
  const taken = await git.output([
    "for-each-ref",
    "--count=1",
    "--format=%(refname)",
    `refs/heads/${candidate}`,
    `refs/remotes/*/${candidate}`,
  ]);
  return taken.trim().length > 0 ? freeBranch(git, name, attempt + 1) : candidate;
}

/**
 * Ties `branch` to the change `id` in git's common configuration (`branch.<branch>.specty`), so
 * Specty knows the change of a branch whatever its name. git drops it with the branch and moves
 * it when the branch is renamed.
 */
export async function markBranch(git: Git, branch: string, id: string): Promise<void> {
  await git.output(["config", `branch.${branch}.specty`, id]);
}
