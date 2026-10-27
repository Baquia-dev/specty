// SPDX-License-Identifier: Apache-2.0
import type { Git } from "../io/git";
import type { Session } from "../session";
import { listOpenChanges, loadChange, type StoredChange } from "../store/changes";

/** Specty's own names, which carry the id. */
const NAMED_BY_ID = /^(?:specty|spike)\/(.+)$/;

/**
 * The change whose branch is `branch`: by its name (`specty/<id>`, `spike/<id>`), else by the
 * mark `new` left, else the open change whose state names it, such as a branch that came from
 * another clone. In that order, so Specty's own names cost no more than before.
 */
export async function changeOfBranch(
  session: Session,
  branch: string,
): Promise<StoredChange | undefined> {
  const { paths } = session;
  const named = NAMED_BY_ID.exec(branch)?.[1];
  // A spike/<slug> of another flow names no id.
  const byName = named === undefined ? undefined : await loadChange(paths, named);
  if (byName !== undefined) return byName;
  const marked = await session.git.config(`branch.${branch}.specty`);
  const byMark = marked === undefined ? undefined : await loadChange(paths, marked);
  if (byMark !== undefined) return byMark;
  return (await listOpenChanges(paths)).find((change) => change.state.branch === branch);
}

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
