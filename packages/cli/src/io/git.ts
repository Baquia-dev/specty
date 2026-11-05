// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ChangedFile } from "@baquia-dev/specty-core";
import { type ExecResult, execute } from "./exec";
import { exists, remove } from "./files";
import { type OpenedHead, type Recalling, recalling, rememberHead } from "./git-memo";

/** Hash of git's empty tree, used to diff against a repository without commits. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly result: ExecResult,
  ) {
    super(`git ${args.join(" ")}: ${result.stderr.trim() || `exit ${result.code ?? "?"}`}`);
  }
}

/** Git's command and its error on one line, without its hints: what is read of a failure. */
export function gitFailure(error: GitError): string {
  const lines = error.result.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("hint:"));
  const detail = lines.length > 0 ? lines.join(" ") : `exit ${error.result.code ?? "?"}`;
  return `git ${error.args[0] ?? ""}: ${detail}`;
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

/** The repository that contains a folder, and what git already said of it. */
export interface OpenedRepository {
  readonly root: string;
  /** The paths of its git folder, by name. */
  readonly known: Readonly<Record<string, string>>;
  /** Undefined in a branch without commits. */
  readonly head?: OpenedHead;
}

const OPENING = ["rev-parse", "--show-toplevel", "--git-path", "specty", "--git-path", "common"];

/**
 * The repository that contains `cwd`, with where git keeps `specty/` and `common/`, HEAD and its
 * branch, in one question to git; undefined outside git. In a branch without commits that question
 * fails, and one without HEAD gives the rest.
 */
export async function openRepository(cwd: string): Promise<OpenedRepository | undefined> {
  const full = await execute("git", [...OPENING, "HEAD", "--abbrev-ref", "HEAD"], { cwd });
  const result = full.code === 0 ? full : await execute("git", OPENING, { cwd });
  const [root, specty, common, commit, branch] = result.stdout.trim().split("\n");
  if (result.code !== 0 || root === undefined || specty === undefined || common === undefined)
    return undefined;
  // A relative path of git's folder is relative to where it was asked.
  const known = { specty: resolve(cwd, specty), common: resolve(cwd, common) };
  if (commit === undefined || branch === undefined) return { root, known };
  return { root, known, head: { commit, branch } };
}

/**
 * Git in `root`. `known` are paths of its folder git already gave and `head`, HEAD and its branch
 * (`openRepository`); the reads that depend only on refs, objects or the configuration are
 * recalled for a while (`io/git-memo.ts`).
 */
export function createGit(
  root: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  known: Readonly<Record<string, string>> = {},
  head?: OpenedHead,
): Git {
  const git = runner(root, baseEnv);
  if (head !== undefined) rememberHead(git, head);
  const gitPath = gitPaths(git, known);
  const repository: Repository = {
    ...git,
    head: () => git.optional(["rev-parse", "--verify", "-q", "HEAD"]),
    gitPath,
    ...worktreeQueries(git),
  };
  return {
    root,
    run: git.run,
    output: git.output,
    head: repository.head,
    branch: () => git.optional(["symbolic-ref", "--short", "-q", "HEAD"]),
    gitPath,
    ...changeQueries(repository),
    ...commitOperations(repository),
    ...fileQueries(git),
    config: (key) => git.optional(["config", "--get", key]),
    worktrees: repository.worktrees,
    nestedWorktrees: repository.nestedWorktrees,
  };
}

/**
 * Git keeps every path under these first segments in one folder: `specty/` in the worktree's git
 * folder, and `common/`, which is in git's list of shared paths, in the common one.
 */
const ONE_FOLDER: ReadonlySet<string> = new Set(["specty", "common"]);

/**
 * Where git keeps each path of its folder (`git rev-parse --git-path`), asking git once per path:
 * a path under `specty/` or `common/` comes from the answer for that segment, so one question
 * serves them all. A question that fails is not kept.
 */
function gitPaths(
  git: Runner,
  known: Readonly<Record<string, string>>,
): (name: string) => Promise<string> {
  const answers = new Map<string, Promise<string>>(
    Object.entries(known).map(([name, path]) => [name, Promise.resolve(path)]),
  );
  const ask = (name: string): Promise<string> => {
    const known = answers.get(name);
    if (known !== undefined) return known;
    const answer = git.output(["rev-parse", "--git-path", name]);
    answers.set(name, answer);
    answer.catch(() => answers.delete(name));
    return answer;
  };
  return async (name) => {
    const [segment, ...rest] = name.split("/");
    const path =
      segment !== undefined && rest.length > 0 && ONE_FOLDER.has(segment)
        ? `${await ask(segment)}/${rest.join("/")}`
        : await ask(name);
    return isAbsolute(path) ? path : resolve(git.root, path);
  };
}

/** Runs git in one repository. */
interface Runner extends Pick<Git, "root" | "run" | "output"> {
  /** Trimmed stdout when git succeeds with some; otherwise undefined. */
  optional(args: readonly string[]): Promise<string | undefined>;
}

/** A runner that also knows HEAD, the git directory and the worktrees. */
type Repository = Runner & Pick<Git, "head" | "gitPath" | "worktrees" | "nestedWorktrees">;

function runner(root: string, baseEnv: NodeJS.ProcessEnv): Runner & Recalling {
  const { run, remember } = recalling((args, options: RunOptions) =>
    execute("git", args, {
      cwd: root,
      env: { ...baseEnv, ...options.env },
      // A diff or a file is read whole: cut, it would lose its beginning.
      whole: true,
      ...(options.input !== undefined ? { input: options.input } : {}),
    }),
  );
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
  return { root, run, output, optional, remember };
}

function worktreeQueries(git: Runner): Pick<Git, "worktrees" | "nestedWorktrees"> {
  // `--porcelain` prints one block per worktree: `worktree <folder>`, then `branch refs/heads/…`
  // unless it is detached.
  const worktrees = async () =>
    (await git.output(["worktree", "list", "--porcelain"])).split("\n\n").flatMap((block) => {
      const lines = block.split("\n");
      const value = (prefix: string) =>
        lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
      const folder = value("worktree ");
      const branch = value("branch refs/heads/");
      if (folder === undefined) return [];
      return [branch === undefined ? { folder } : { folder, branch }];
    });
  const nestedWorktrees = async () => {
    const own = await resolved(git.root);
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
  return { worktrees, nestedWorktrees };
}

function changeQueries(git: Repository): Pick<Git, "changedSince" | "staged"> {
  return {
    async changedSince(base) {
      const tracked = await git.output(["diff", "--name-status", "-z", "-M", base ?? EMPTY_TREE]);
      return [...parseNameStatus(tracked), ...(await untracked(git))];
    },
    async staged() {
      const base = (await git.head()) ?? EMPTY_TREE;
      return parseNameStatus(
        await git.output(["diff", "--cached", "--name-status", "-z", "-M", base]),
      );
    },
  };
}

async function untracked(git: Repository): Promise<ChangedFile[]> {
  const paths = (await git.output(["ls-files", "--others", "--exclude-standard", "-z"]))
    .split("\0")
    .filter((path) => path.length > 0);
  // git lists a nested repository as `dir/`; a worktree of this repository there belongs to
  // another change, not to this one.
  const nested = paths.some((path) => path.endsWith("/"))
    ? new Set((await git.nestedWorktrees()).map((folder) => `${folder}/`))
    : new Set<string>();
  return paths
    .filter((path) => !nested.has(path))
    .map((path): ChangedFile => ({ path, status: "added" }));
}

function commitOperations(
  git: Repository,
): Pick<Git, "writeTree" | "treeWith" | "commit" | "operationInProgress"> {
  return {
    writeTree: (options) => git.output(["write-tree"], options),
    async treeWith(paths) {
      // A name of its own on every call: two readings at once in this process must not share it.
      const index = await git.gitPath(`specty/index-${process.pid}-${randomUUID()}`);
      const env = { GIT_INDEX_FILE: index };
      await mkdir(dirname(index), { recursive: true });
      try {
        const base = await git.head();
        await git.output(base === undefined ? ["read-tree", "--empty"] : ["read-tree", base], {
          env,
        });
        await git.output(["add", "-A", "--", ...paths], { env });
        return await git.output(["write-tree"], { env });
      } finally {
        await remove(index);
      }
    },
    async commit(message, paths) {
      const args = ["commit", "-q", "-F", "-", ...(paths === undefined ? [] : ["--", ...paths])];
      await git.output(args, { input: message });
      return git.output(["rev-parse", "HEAD"]);
    },
    async operationInProgress() {
      const markers = [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
      ];
      const found = await Promise.all(
        markers.map(async (marker) => exists(await git.gitPath(marker))),
      );
      return found.some(Boolean);
    },
  };
}

function fileQueries(git: Runner): Pick<Git, "isTracked" | "files" | "ignored"> {
  return {
    async isTracked(path) {
      return (await git.run(["ls-files", "--error-unmatch", "--", path])).code === 0;
    },
    async files() {
      const paths = (
        await git.output(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
      )
        .split("\0")
        // A nested repository or worktree is listed as `dir/`: it is not a file of this one.
        .filter((path) => path.length > 0 && !path.endsWith("/"));
      // An unmerged path is listed once per stage.
      return [...new Set(paths)];
    },
    async ignored(paths) {
      if (paths.length === 0) return [];
      // One call for every path; exit 1 only means that none is ignored.
      const result = await git.run(["check-ignore", "-z", "--stdin"], {
        input: `${paths.join("\0")}\0`,
      });
      if (result.code !== 0 && result.code !== 1) throw new GitError(["check-ignore"], result);
      return result.stdout.split("\0").filter((path) => path.length > 0);
    },
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
    files.push({ path: tokens[index + 1] ?? "", status: statusOf(code) });
    index += 2;
  }
  return files;
}

/** What the letter of a path that is neither renamed nor copied says of it. */
function statusOf(code: string): ChangedFile["status"] {
  return code === "A" ? "added" : code === "D" ? "deleted" : "modified";
}

/** Every path a change touches, both sides of renames included. */
export function pathsOf(files: readonly ChangedFile[]): string[] {
  return [
    ...new Set(
      files.flatMap((file) => (file.from === undefined ? [file.path] : [file.from, file.path])),
    ),
  ];
}
