// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { type ChangedFile, type CheckMode, isGoverned, matchesAny } from "@baquia-dev/specty-core";
import { targetBranch } from "../flow/worktree";
import { readText } from "../io/files";
import type { Session } from "../session";
import type { CheckContext } from "./provider";

/**
 * What a `specty check` run sees: its files, their text as the mode sees it (staged with
 * `--staged`, on disk otherwise) and the lines each one adds, so that a check can leave out what
 * was already there before the change.
 */
export async function checkContext(session: Session, mode: CheckMode): Promise<CheckContext> {
  const base = mode === "changed" ? await baseOf(session) : undefined;
  const [files, added] = await Promise.all([
    selectFiles(session, mode, base),
    addedLines(session, mode, base),
  ]);
  const texts = new Map<string, Promise<string | undefined>>();
  return {
    session,
    mode,
    files,
    read(path) {
      const known = texts.get(path);
      if (known !== undefined) return known;
      const text = mode === "staged" ? staged(session, path) : readText(join(session.root, path));
      texts.set(path, text);
      return text;
    },
    added: (path) => added?.get(path),
  };
}

/**
 * The files of the run: what changed against the target branch (the merge-base, plus new files
 * git does not track), what is staged, or everything git sees. Never Specty's own files, what is
 * not governed, what is generated, or `checks.exclude`.
 */
async function selectFiles(
  session: Session,
  mode: CheckMode,
  base: string | undefined,
): Promise<string[]> {
  const paths = await candidates(session, mode, base);
  const { config } = session;
  return [...new Set(paths)].filter(
    (path) =>
      !path.startsWith(".specty/") &&
      isGoverned(path, config) &&
      !matchesAny(path, config.scope.generated) &&
      !matchesAny(path, config.checks.exclude),
  );
}

async function candidates(
  session: Session,
  mode: CheckMode,
  base: string | undefined,
): Promise<string[]> {
  const { git } = session;
  if (mode === "all") return git.files();
  if (mode === "staged") return present(await git.staged());
  return present(await git.changedSince(base));
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

async function staged(session: Session, path: string): Promise<string | undefined> {
  const shown = await session.git.run(["cat-file", "blob", `:${path}`]);
  return shown.code === 0 ? shown.stdout : undefined;
}

/**
 * Lines each file adds, from 1, by its diff against the start of the run; undefined when every
 * line counts (`--all`, or a repository with no commits yet). A file missing from the map, new
 * and untracked or with a path git quotes, counts whole: more findings, never fewer.
 */
async function addedLines(
  session: Session,
  mode: CheckMode,
  base: string | undefined,
): Promise<ReadonlyMap<string, ReadonlySet<number>> | undefined> {
  const against = mode === "staged" ? "--cached" : base;
  if (mode === "all" || against === undefined) return undefined;
  // Fixed so that the user's git configuration does not change the shape of the diff.
  const diff = await session.git.output([
    "-c",
    "core.quotePath=false",
    "diff",
    "-U0",
    "-M",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    against,
  ]);
  return parseAddedLines(diff);
}

const HUNK = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Reads the headers and hunks of a `git diff -U0`, skipping each hunk's lines by its counts. */
function parseAddedLines(diff: string): Map<string, Set<number>> {
  const added = new Map<string, Set<number>>();
  let current: Set<number> | undefined;
  let pending = 0;
  for (const line of diff.split("\n")) {
    if (pending > 0) {
      // «\ No newline at end of file» is a note of git, not a line of the file.
      if (!line.startsWith("\\")) pending -= 1;
      continue;
    }
    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      const start = Number(hunk[2]);
      const count = Number(hunk[3] ?? "1");
      for (let offset = 0; offset < count; offset += 1) current?.add(start + offset);
      pending = Number(hunk[1] ?? "1") + count;
    } else if (line.startsWith("diff --git ")) {
      current = undefined;
    } else if (line.startsWith("rename to ")) {
      current = fileIn(added, line.slice("rename to ".length));
    } else if (line.startsWith("+++ ")) {
      current = line.startsWith("+++ b/") ? fileIn(added, line.slice("+++ b/".length)) : undefined;
    }
  }
  return added;
}

/** The set of `path`, which git ends with a tab when it has spaces; none for a quoted path. */
function fileIn(added: Map<string, Set<number>>, header: string): Set<number> | undefined {
  const path = header.replace(/\t$/, "");
  if (path.startsWith('"')) return undefined;
  const lines = added.get(path) ?? new Set<number>();
  added.set(path, lines);
  return lines;
}
