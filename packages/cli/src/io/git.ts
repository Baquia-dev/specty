// SPDX-License-Identifier: Apache-2.0
import { mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ChangedFile } from "@baquia-dev/specty-core";
import { type ExecResult, execute } from "./exec";
import { exists, remove } from "./files";

/** Hash of git's empty tree, used to diff against a repository without commits. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly result: ExecResult,
  ) {
    super(`git ${args.join(" ")}: ${result.stderr.trim() || `exit ${result.code ?? "?"}`}`);
  }
}

interface RunOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly input?: string;
}

export interface Git {
  readonly root: string;
  run(args: readonly string[], options?: RunOptions): Promise<ExecResult>;
  /** Trimmed stdout; throws GitError when git fails. */
  output(args: readonly string[], options?: RunOptions): Promise<string>;
  head(): Promise<string | undefined>;
  branch(): Promise<string | undefined>;
  /** Absolute path inside the git directory (handles worktrees). */
  gitPath(name: string): Promise<string>;
  /** Tracked changes since `base` (or since nothing) plus untracked files. */
  changedSince(base: string | undefined): Promise<ChangedFile[]>;
  staged(): Promise<ChangedFile[]>;
  writeTree(options?: RunOptions): Promise<string>;
  /** Tree a commit of HEAD plus the current content of `paths` would have. */
  treeWith(paths: readonly string[]): Promise<string>;
  commit(message: string, paths?: readonly string[]): Promise<string>;
  operationInProgress(): Promise<boolean>;
  isTracked(path: string): Promise<boolean>;
  /** Repository-relative files git tracks, plus the untracked ones it does not ignore. */
  files(): Promise<string[]>;
  /** The repository-relative `paths` that git ignores and does not track. */
  ignored(paths: readonly string[]): Promise<string[]>;
  config(key: string): Promise<string | undefined>;
  /** Every worktree of the repository, the main one first. */
  worktrees(): Promise<Worktree[]>;
  /** Repository-relative folders of the other worktrees that live inside this one. */
  nestedWorktrees(): Promise<string[]>;
}

export interface Worktree {
  readonly folder: string;
  /** Its branch, unless it is detached. */
  readonly branch?: string;
}

/** Root of the repository that contains `cwd`, or undefined outside git. */
export async function findRoot(cwd: string): Promise<string | undefined> {
  const result = await execute("git", ["rev-parse", "--show-toplevel"], { cwd });
  return result.code === 0 ? result.stdout.trim() : undefined;
}

export function createGit(root: string, baseEnv: NodeJS.ProcessEnv = process.env): Git {
  const run = (args: readonly string[], options: RunOptions = {}) =>
    execute("git", args, {
      cwd: root,
      env: { ...baseEnv, ...options.env },
      // A diff or a file is read whole: cut, it would lose its beginning.
      whole: true,
      ...(options.input !== undefined ? { input: options.input } : {}),
    });
  const output = async (args: readonly string[], options: RunOptions = {}) => {
    const result = await run(args, options);
    if (result.code !== 0) throw new GitError(args, result);
    return result.stdout.trim();
  };
  const optional = async (args: readonly string[]) => {
    const result = await run(args);
    const value = result.stdout.trim();
    return result.code === 0 && value.length > 0 ? value : undefined;
  };
  const gitPath = async (name: string) => {
    const path = await output(["rev-parse", "--git-path", name]);
    return isAbsolute(path) ? path : resolve(root, path);
  };
  const head = () => optional(["rev-parse", "--verify", "-q", "HEAD"]);
  // `--porcelain` prints one block per worktree: `worktree <folder>`, then `branch refs/heads/…`
  // unless it is detached.
  const worktrees = async () =>
    (await output(["worktree", "list", "--porcelain"])).split("\n\n").flatMap((block) => {
      const lines = block.split("\n");
      const value = (prefix: string) =>
        lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
      const folder = value("worktree ");
      const branch = value("branch refs/heads/");
      if (folder === undefined) return [];
      return [branch === undefined ? { folder } : { folder, branch }];
    });
  const nestedWorktrees = async () => {
    const own = await resolved(root);
    const folders = await Promise.all(
      (await worktrees()).map((worktree) => resolved(worktree.folder)),
    );
    return folders.flatMap((folder) => {
      const inner = relative(own, folder);
      return inner === "" || inner.startsWith("..") || isAbsolute(inner)
        ? []
        : [inner.split(sep).join("/")];
    });
  };
  const untracked = async () => {
    const paths = (await output(["ls-files", "--others", "--exclude-standard", "-z"]))
      .split("\0")
      .filter((path) => path.length > 0);
    // git lists a nested repository as `dir/`; a worktree of this repository there belongs to
    // another change, not to this one.
    const nested = paths.some((path) => path.endsWith("/"))
      ? new Set((await nestedWorktrees()).map((folder) => `${folder}/`))
      : new Set<string>();
    return paths
      .filter((path) => !nested.has(path))
      .map((path): ChangedFile => ({ path, status: "added" }));
  };

  return {
    root,
    run,
    output,
    head,
    branch: () => optional(["symbolic-ref", "--short", "-q", "HEAD"]),
    gitPath,
    async changedSince(base) {
      const tracked = await output(["diff", "--name-status", "-z", "-M", base ?? EMPTY_TREE]);
      return [...parseNameStatus(tracked), ...(await untracked())];
    },
    async staged() {
      const base = (await head()) ?? EMPTY_TREE;
      return parseNameStatus(await output(["diff", "--cached", "--name-status", "-z", "-M", base]));
    },
    writeTree: (options) => output(["write-tree"], options),
    async treeWith(paths) {
      const index = await gitPath(`specty/index-${process.pid}-${Date.now()}`);
      const env = { GIT_INDEX_FILE: index };
      await mkdir(dirname(index), { recursive: true });
      try {
        const base = await head();
        await output(base === undefined ? ["read-tree", "--empty"] : ["read-tree", base], { env });
        await output(["add", "-A", "--", ...paths], { env });
        return await output(["write-tree"], { env });
      } finally {
        await remove(index);
      }
    },
    async commit(message, paths) {
      const args = ["commit", "-q", "-F", "-", ...(paths === undefined ? [] : ["--", ...paths])];
      await output(args, { input: message });
      return output(["rev-parse", "HEAD"]);
    },
    async operationInProgress() {
      const markers = [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
      ];
      const found = await Promise.all(markers.map(async (marker) => exists(await gitPath(marker))));
      return found.some(Boolean);
    },
    async isTracked(path) {
      return (await run(["ls-files", "--error-unmatch", "--", path])).code === 0;
    },
    async files() {
      const paths = (await output(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]))
        .split("\0")
        // A nested repository or worktree is listed as `dir/`: it is not a file of this one.
        .filter((path) => path.length > 0 && !path.endsWith("/"));
      // An unmerged path is listed once per stage.
      return [...new Set(paths)];
    },
    async ignored(paths) {
      if (paths.length === 0) return [];
      // One call for every path; exit 1 only means that none is ignored.
      const result = await run(["check-ignore", "-z", "--stdin"], {
        input: `${paths.join("\0")}\0`,
      });
      if (result.code !== 0 && result.code !== 1) throw new GitError(["check-ignore"], result);
      return result.stdout.split("\0").filter((path) => path.length > 0);
    },
    config: (key) => optional(["config", "--get", key]),
    worktrees,
    nestedWorktrees,
  };
}

/** The path with symbolic links resolved, or as given when it does not exist. */
export function resolved(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}

/** Parses `git diff --name-status -z` output; copies count as additions. */
export function parseNameStatus(output: string): ChangedFile[] {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const files: ChangedFile[] = [];
  let index = 0;
  while (index < tokens.length) {
    const code = (tokens[index] ?? "").charAt(0);
    if (code === "R" || code === "C") {
      const from = tokens[index + 1] ?? "";
      const path = tokens[index + 2] ?? "";
      files.push(code === "R" ? { path, from, status: "renamed" } : { path, status: "added" });
      index += 3;
      continue;
    }
    const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
    files.push({ path: tokens[index + 1] ?? "", status });
    index += 2;
  }
  return files;
}

/** Every path a change touches, both sides of renames included. */
export function pathsOf(files: readonly ChangedFile[]): string[] {
  return [
    ...new Set(
      files.flatMap((file) => (file.from === undefined ? [file.path] : [file.from, file.path])),
    ),
  ];
}
