// SPDX-License-Identifier: Apache-2.0
import { type ChangedFile, type CheckMode, isGoverned, matchesAny } from "@baquia-dev/specty-core";
import { targetBranch } from "../flow/worktree";
import type { Session } from "../session";

/**
 * The files a `specty check` run looks at: what changed against the target branch (the
 * merge-base, plus new files git does not track), what is staged, or everything git sees. Never
 * Specty's own files, what is not governed, what is generated, or `checks.exclude`.
 */
export async function selectFiles(session: Session, mode: CheckMode): Promise<string[]> {
  const paths = await candidates(session, mode);
  const { config } = session;
  return [...new Set(paths)].filter(
    (path) =>
      !path.startsWith(".specty/") &&
      isGoverned(path, config) &&
      !matchesAny(path, config.scope.generated) &&
      !matchesAny(path, config.checks.exclude),
  );
}

async function candidates(session: Session, mode: CheckMode): Promise<string[]> {
  const { git } = session;
  if (mode === "all") return git.files();
  if (mode === "staged") return present(await git.staged());
  return present(await git.changedSince(await baseOf(session)));
}

/** Where `--changed` starts: the merge-base with the target branch, or HEAD without one. */
async function baseOf(session: Session): Promise<string | undefined> {
  const { git } = session;
  const target = await targetBranch(git, session.config.git.target);
  if (target !== undefined) {
    const merged = await git.run(["merge-base", "HEAD", target]);
    if (merged.code === 0) return merged.stdout.trim();
  }
  return git.head();
}

/** Deleted files have nothing left to check. */
function present(files: readonly ChangedFile[]): string[] {
  return files.filter((file) => file.status !== "deleted").map((file) => file.path);
}
