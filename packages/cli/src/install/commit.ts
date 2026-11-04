// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  changeInProgressWarning,
  installCommitFailedWarning,
  installCommitLine,
  installCommitSubject,
  yoursUncommittedWarning,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { commitWithReceipt } from "../flow/commits";
import { remove } from "../io/files";
import { type Git, GitError, pathsOf } from "../io/git";
import { COMMAND, type Environment, openSession } from "../session";

export interface InstallCommit {
  /** What was committed, for init's output. */
  readonly done: readonly string[];
  readonly warnings: readonly string[];
  /** The commit failed and what was written to its files was undone; the warnings say why. */
  readonly failed?: boolean;
}

/**
 * Commits what `init` wrote (`written`, repository-relative), so the folder is clean afterwards:
 * only the files that now differ from HEAD and had no changes before `init` ran (`before`), with
 * a receipt for the git hooks. Nothing is committed while this folder has a change in progress:
 * the files would land on its branch, outside its tasks.
 */
export async function commitInstall(
  environment: Environment,
  written: readonly string[],
  before: ReadonlySet<string>,
  first: boolean,
): Promise<InstallCommit> {
  const opened = await openSession(environment);
  if (opened.kind !== "ok") return { done: [], warnings: [] };
  const { session } = opened;
  const { lang } = session;
  const active = await resolveActive(session);
  if (active !== undefined && !isFinished(active.state)) {
    return { done: [], warnings: [changeInProgressWarning(active.state.id, COMMAND, lang)] };
  }
  const changed = new Set(pathsOf(await session.git.changedSince(await session.git.head())));
  const candidates = [...new Set(written)].filter((path) => changed.has(path)).toSorted();
  const mine = candidates.filter((path) => !before.has(path));
  const yours = candidates.filter((path) => before.has(path));
  const warnings = yours.length === 0 ? [] : [yoursUncommittedWarning(yours, lang)];
  if (mine.length === 0) return { done: [], warnings };
  try {
    const commit = await commitWithReceipt(session, {
      subject: installCommitSubject(first, lang),
      trailers: { "Specty-Init": "true" },
      stage: [mine],
      only: mine,
      receipt: { change: "", kind: "init" },
    });
    return { done: [installCommitLine(commit, mine, lang)], warnings };
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    await undo(session.git, mine);
    const failed = installCommitFailedWarning(mine, failure(error), lang);
    return { done: [], warnings: [...warnings, failed], failed: true };
  }
}

/**
 * Puts `paths` back as HEAD has them and deletes those it lacks, with none left staged. Only
 * `init` had changed them, so nothing of the person's is lost, and running it again commits them.
 */
async function undo(git: Git, paths: readonly string[]): Promise<void> {
  const head = await git.head();
  const tracked =
    head === undefined
      ? []
      : (await git.output(["ls-tree", "-r", "-z", "--name-only", head, "--", ...paths]))
          .split("\0")
          .filter((path) => path.length > 0);
  if (head !== undefined && tracked.length > 0) {
    await git.output(["checkout", head, "--", ...tracked]);
  }
  const created = paths.filter((path) => !tracked.includes(path));
  if (created.length === 0) return;
  await git.output(["rm", "-q", "-f", "--cached", "--ignore-unmatch", "--", ...created]);
  for (const path of created) await remove(join(git.root, path));
}

/** Git's command and its error on one line, without its hints. */
function failure(error: GitError): string {
  const lines = error.result.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("hint:"));
  const detail = lines.length > 0 ? lines.join(" ") : `exit ${error.result.code ?? "?"}`;
  return `git ${error.args[0] ?? ""}: ${detail}`;
}
