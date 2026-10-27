// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, sep } from "node:path";

/** Locations of Specty's files inside a repository (docs/formats.md §1). */
export interface RepoPaths {
  readonly root: string;
  readonly specty: string;
  readonly config: string;
  readonly changes: string;
  readonly archive: string;
  changeDir(id: string): string;
  archivedDir(id: string, year: number): string;
  /** Repository-relative POSIX path. */
  relative(path: string): string;
}

export const SPECTY_DIR = ".specty";

export function repoPaths(root: string): RepoPaths {
  const specty = join(root, SPECTY_DIR);
  return {
    root,
    specty,
    config: join(specty, "config.yaml"),
    changes: join(specty, "changes"),
    archive: join(specty, "archive"),
    changeDir: (id) => join(specty, "changes", id),
    archivedDir: (id, year) => join(specty, "archive", String(year), id),
    relative: (path) => posixRelative(root, path),
  };
}

/** `relative()` with `/` on every system, as Specty shows and stores paths. */
export function posixRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

/** A path as the person reads it: relative to the repository, or whole when outside it. */
export function shownPath(root: string, path: string): string {
  const inner = relative(root, path);
  return inner.startsWith("..") || isAbsolute(inner) ? path : inner.split(sep).join("/");
}

/** Files of one change, inside its directory (open or archived). */
export interface ChangeFiles {
  readonly dir: string;
  readonly spec: string;
  readonly state: string;
  readonly audit: string;
  revision(number: number): string;
}

export function changeFiles(dir: string): ChangeFiles {
  return {
    dir,
    spec: join(dir, "spec.md"),
    state: join(dir, "state.json"),
    audit: join(dir, "audit.jsonl"),
    revision: (number) => join(dir, "revisions", `r${number}.md`),
  };
}
