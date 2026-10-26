// SPDX-License-Identifier: Apache-2.0
import {
  changeInProgressWarning,
  installCommitLine,
  installCommitSubject,
  yoursUncommittedWarning,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { commitWithReceipt } from "../flow/commits";
import { pathsOf } from "../io/git";
import { COMMAND, type Environment, openSession } from "../session";

export interface InstallCommit {
  /** What was committed, for init's output. */
  readonly done: readonly string[];
  readonly warnings: readonly string[];
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
  const commit = await commitWithReceipt(session, {
    subject: installCommitSubject(first, lang),
    trailers: { "Specty-Init": "true" },
    stage: [mine],
    only: mine,
    receipt: { change: "", kind: "init" },
  });
  return { done: [installCommitLine(commit, mine, lang)], warnings };
}
