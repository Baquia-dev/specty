// SPDX-License-Identifier: Apache-2.0
import {
  commitOrDiscardNext,
  incorporationTitle,
  managedBySpecty,
  type OutputBlock,
  personOnlyLine,
  uncommittedOverlapLine,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";

/**
 * The uncommitted files in the change's folder, within `paths` when given, that `target` changed
 * since their common base: tracked files that differ from HEAD, in the index or in the folder, and
 * untracked ones that are not ignored. A merge of `target` would overwrite them, so git refuses it.
 */
export async function uncommittedChangedBy(
  session: Session,
  target: string,
  paths?: readonly string[],
): Promise<string[]> {
  const only = paths === undefined ? [] : ["--", ...paths];
  const uncommitted = new Set([
    ...(await names(session, ["diff", "--name-only", "-z", "HEAD", ...only])),
    ...(await names(session, ["ls-files", "--others", "--exclude-standard", "-z", ...only])),
  ]);
  const theirs = await names(session, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    `HEAD...${target}`,
  ]);
  return theirs.filter((path) => uncommitted.has(path)).toSorted();
}

/** Why the incorporation does not start, and what to do. */
interface UncommittedRefusal {
  readonly reasons: readonly string[];
  readonly details: OutputBlock;
  readonly next: string;
}

/**
 * Right before merging `target` into the change's folder: when `target` changed files that are
 * uncommitted here, git would refuse the merge with a bare «Merge with strategy ort failed», and a
 * merge by hand would hit the same. The merge does not start: this names those files, says that
 * only the person commits or discards the ones Specty manages, such as `.specty/config.yaml`, and
 * asks to commit or discard them and run `again`. Undefined when there are none.
 */
export async function uncommittedRefusal(
  session: Session,
  target: string,
  again: "close" | "accept",
): Promise<UncommittedRefusal | undefined> {
  const paths = await uncommittedChangedBy(session, target);
  if (paths.length === 0) return undefined;
  const { lang, cards } = session;
  const managed = paths.filter((path) => managedBySpecty(path));
  return {
    reasons: [
      uncommittedOverlapLine(target, lang),
      ...(managed.length > 0 ? [personOnlyLine(managed, lang)] : []),
    ],
    details: { title: incorporationTitle("uncommitted", lang), lines: paths },
    next: commitOrDiscardNext(again, cards),
  };
}

/** The repository-relative paths a git command prints with `-z`. */
async function names(session: Session, args: readonly string[]): Promise<string[]> {
  return (await session.git.output(args)).split("\0").filter((name) => name.length > 0);
}
