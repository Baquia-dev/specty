// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { rescueCommitSubject } from "@baquia-dev/specty-core";
import { exists, remove } from "../io/files";
import { type Git, GitError } from "../io/git";
import type { Session } from "../session";
import { reasonOf } from "./integrate";
import { gitCommonFolder } from "./worktree";

/** What the clean-up saved of a folder before removing it (formats.md §1). */
export type Rescue =
  | { readonly kind: "nothing" }
  | { readonly kind: "saved"; readonly ref: string; readonly bytes: number }
  | { readonly kind: "failed"; readonly reason: string };

/** Where the rescue refs live, under the name of the folder each one saved. */
const RESCUE_REFS = "refs/specty/rescue";

/** Git's tree with nothing in it. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** How many names a rescue tries when others of the same folder took that second: `-2`, `-3`… */
const NAMES = 9;

/**
 * Saves in a rescue ref, `refs/specty/rescue/<name>/<YYYYMMDDHHMMSS>` (UTC), what `folder` has that
 * git does not ignore and no commit holds: a commit on top of `parent` (the commit of its branch,
 * for a worktree) or with no parent (a ghost folder). It is made with a temporary index and the
 * folder as the work tree, so no branch and nobody's index moves. With nothing to save there is no
 * ref; when git fails, its reason, and the folder is left as it was.
 */
export async function rescueFolder(
  session: Session,
  folder: string,
  parent?: string,
): Promise<Rescue> {
  const { git } = session;
  // A name of its own, as `treeWith`'s: `prune` removes it if the process dies on the way.
  const index = await git.gitPath(`specty/index-${process.pid}-${randomUUID()}`);
  await mkdir(dirname(index), { recursive: true });
  try {
    const tree = await stage(git, folder, parent, index);
    const base =
      parent === undefined ? EMPTY_TREE : await git.output(["rev-parse", `${parent}^{tree}`]);
    if (tree === base) return { kind: "nothing" };
    const bytes = await addedBytes(git, base, tree);
    const name = basename(folder);
    const commit = await git.output(
      ["commit-tree", tree, ...(parent === undefined ? [] : ["-p", parent])],
      { input: rescueCommitSubject(name, session.lang) },
    );
    return { kind: "saved", ref: await createRef(session, name, commit), bytes };
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    return { kind: "failed", reason: reasonOf(error.result) };
  } finally {
    await remove(index);
  }
}

/**
 * Stages in the temporary `index` the tree of `folder` on top of `parent` and writes it: what the
 * tracked files changed, and the untracked ones git does not ignore, also by the main folder's
 * `.gitignore`, since a ghost folder rarely has its own.
 */
async function stage(
  git: Git,
  folder: string,
  parent: string | undefined,
  index: string,
): Promise<string> {
  const env = { GIT_INDEX_FILE: index };
  const there = ["-C", folder, `--git-dir=${await gitCommonFolder(git)}`, `--work-tree=${folder}`];
  const run = (args: readonly string[], input?: string) =>
    git.output([...there, ...args], { env, ...(input === undefined ? {} : { input }) });
  await run(["read-tree", ...(parent === undefined ? ["--empty"] : [parent])]);
  if (parent !== undefined) await run(["add", "-u"]);
  const listing = ["ls-files", "-o", "-z", "--exclude-standard", ...(await mainIgnore(git))];
  // Untrimmed: the list ends in a NUL, and a name may end in a space.
  const untracked = await git.run([...there, ...listing], { env });
  if (untracked.code !== 0) throw new GitError(listing, untracked);
  if (untracked.stdout.length > 0)
    await run(["update-index", "--add", "-z", "--stdin"], untracked.stdout);
  return run(["write-tree"]);
}

/** `--exclude-from` the main folder's `.gitignore`, when it has one. */
async function mainIgnore(git: Git): Promise<string[]> {
  const main = (await git.worktrees())[0]?.folder ?? git.root;
  const ignore = join(main, ".gitignore");
  return (await exists(ignore)) ? [`--exclude-from=${ignore}`] : [];
}

/** What the blobs `tree` has new against `base` weigh. */
async function addedBytes(git: Git, base: string, tree: string): Promise<number> {
  // One line per path: `:<old mode> <new mode> <old oid> <new oid> <status>\t<path>`.
  const diff = await git.output(["diff-tree", "-r", "--no-renames", base, tree]);
  const blobs = diff.split("\n").flatMap((line) => {
    const oid = line.split(" ")[3];
    return oid === undefined || /^0+$/.test(oid) ? [] : [oid];
  });
  if (blobs.length === 0) return 0;
  const sizes = await git.output(["cat-file", "--batch-check=%(objectsize)"], {
    input: `${blobs.join("\n")}\n`,
  });
  // A submodule's commit is not in this repository: `<oid> missing` weighs nothing.
  return sizes.split("\n").reduce((sum, size) => sum + (Number(size) || 0), 0);
}

/** Creates the rescue ref of `name` for `commit` where there is none yet, and gives its name. */
async function createRef(session: Session, name: string, commit: string): Promise<string> {
  const { git } = session;
  const stamp = session.environment.now().toISOString().replace(/\D/g, "").slice(0, 14);
  const first = `${RESCUE_REFS}/${refName(name)}/${stamp}`;
  for (let n = 1; ; n++) {
    const ref = n === 1 ? first : `${first}-${n}`;
    // The empty old value makes git refuse a ref that already exists.
    const made = await git.run(["update-ref", ref, commit, ""]);
    if (made.code === 0) return ref;
    const taken = (await git.run(["rev-parse", "--verify", "-q", ref])).code === 0;
    if (!taken || n >= NAMES) throw new GitError(["update-ref", ref], made);
  }
}

/** `name` as a level of a ref: `-` instead of what git does not take there. */
function refName(name: string): string {
  const safe = name
    .replace(/[^\w.-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/^\.+|\.lock$/g, "");
  return safe.length > 0 ? safe : "folder";
}
