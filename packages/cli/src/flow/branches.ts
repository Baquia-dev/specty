// SPDX-License-Identifier: Apache-2.0
import { type Git, GitError } from "../io/git";
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
 * The waits, in milliseconds, between tries of `markBranch`: another process of the clone holds
 * git's configuration (`.git/config.lock`) only while it writes, so a moment later it is free.
 */
const LOCK_WAITS: readonly number[] = [50, 100, 200, 400, 800];

/**
 * Ties `branch` to the change `id` in git's common configuration (`branch.<branch>.specty`), so
 * Specty knows the change of a branch whatever its name. git drops it with the branch and moves
 * it when the branch is renamed. A failed write is tried again after each of `waits`, whatever
 * git says (its message may come translated); after the last, it throws git's error.
 */
export async function markBranch(
  git: Pick<Git, "run">,
  branch: string,
  id: string,
  waits: readonly number[] = LOCK_WAITS,
): Promise<void> {
  const args = ["config", `branch.${branch}.specty`, id];
  let result = await git.run(args);
  for (const wait of waits) {
    if (result.code === 0) return;
    await new Promise((done) => setTimeout(done, wait));
    result = await git.run(args);
  }
  if (result.code !== 0) throw new GitError(args, result);
}

/** The branches `markBranch` tied to a change; git exits with 1 when there is none. */
export async function markedBranches(git: Git): Promise<string[]> {
  return (await markedChanges(git)).map(({ branch }) => branch);
}

/** Each branch `markBranch` tied to a change, with that change's id. */
export async function markedChanges(
  git: Git,
): Promise<{ readonly branch: string; readonly id: string }[]> {
  const marks = await git.run(["config", "--get-regexp", "^branch\\..*\\.specty$"]);
  if (marks.code !== 0) return [];
  return marks.stdout.split("\n").flatMap((line) => {
    const [, branch, id] = /^branch\.(.+)\.specty (\S+)$/.exec(line.trim()) ?? [];
    return branch === undefined || id === undefined ? [] : [{ branch, id }];
  });
}
