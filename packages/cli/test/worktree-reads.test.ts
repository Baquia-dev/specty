// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exists } from "../src/io/files";
import { createGit, type Git, openRepository } from "../src/io/git";
import { CONFIG, cli, git, tempRepo, testEnv } from "./support";

/** A repository with a source folder, and a worktree of it on branch `otro`. */
async function withWorktree() {
  const root = await tempRepo({
    ".specty/config.yaml": CONFIG(),
    "src/app.ts": "export const a = 1;\n",
  });
  const folder = join(root, ".worktrees", "otro");
  git(root, "worktree", "add", "-q", "-b", "otro", folder);
  return { root, folder };
}

/** A fresh file for `GIT_TRACE`. */
const traceFile = async () => join(await mkdtemp(join(tmpdir(), "specty-trace-")), "git.log");

/** The git commands a `GIT_TRACE` file ran that start with `command`, without the `git`. */
async function traced(file: string, command = ""): Promise<string[]> {
  if (!(await exists(file))) return [];
  const prefix = "trace: built-in: git ";
  return (await readFile(file, "utf8"))
    .split("\n")
    .flatMap((line) => {
      const at = line.indexOf(prefix);
      return at < 0 ? [] : [line.slice(at + prefix.length)];
    })
    .filter((ran) => ran.startsWith(command));
}

/** What git itself answers for `name` in `folder`. */
const answer = (folder: string, name: string) =>
  resolve(folder, git(folder, "rev-parse", "--git-path", name));

/** The folder `repo` lists whose branch is `branch`. */
async function listedOn(repo: Git, branch: string): Promise<string> {
  const found = (await repo.worktrees()).find((worktree) => worktree.branch === branch);
  if (found === undefined) throw new Error(`no worktree on ${branch}`);
  return found.folder;
}

/** Stops the clock, so nothing a `Git` recalls gets old while the test reads. */
function stopClock(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the Git of another folder", () => {
  it("AC2: gives HEAD, the branch and where its git folder keeps specty/ and common/ as git does there, without asking git", async () => {
    const { root, folder } = await withWorktree();
    git(folder, "commit", "-q", "--allow-empty", "-m", "otro");
    git(root, "worktree", "add", "-q", "--detach", join(root, ".worktrees", "suelta"));
    const opened = await openRepository(folder);
    const trace = await traceFile();
    const repo = createGit(folder, testEnv({ GIT_TRACE: trace }), opened?.known, opened?.head);
    const others = (await repo.worktrees()).filter((worktree) => worktree.folder !== repo.root);
    expect(others.map((worktree) => worktree.branch)).toEqual(["main", undefined]);
    for (const { folder: there } of others) {
      const other = repo.inWorktree(there);
      expect(await other.head()).toBe(git(there, "rev-parse", "HEAD"));
      expect(await other.output(["rev-parse", "HEAD"])).toBe(git(there, "rev-parse", "HEAD"));
      expect(await other.branch()).toBe(git(there, "branch", "--show-current") || undefined);
      for (const name of ["specty/retro", "common/specty/delegated.json"])
        expect(await other.gitPath(name)).toBe(answer(there, name));
    }
    expect(await traced(trace, "symbolic-ref")).toEqual([]);
    expect(await traced(trace, "rev-parse")).toEqual([]);
    expect(await traced(trace, "worktree list")).toHaveLength(1);
  });

  it("AC2: in a branch without commits it asks git, and answers as git does", async () => {
    const { root } = await withWorktree();
    const empty = join(root, ".worktrees", "vacia");
    git(root, "worktree", "add", "-q", "--detach", empty);
    git(empty, "switch", "-q", "--orphan", "vacia");
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    const other = repo.inWorktree(await listedOn(repo, "vacia"));
    expect(await other.branch()).toBe("vacia");
    expect(await other.head()).toBeUndefined();
    expect(await traced(trace, "symbolic-ref")).toHaveLength(1);
    expect(await traced(trace, "rev-parse --verify -q HEAD")).toHaveLength(1);
  });
});

describe("what the Gits of several folders recall", () => {
  it("AC3: a command of the session's Git that moves another folder's branch makes that folder's Git ask again", async () => {
    stopClock();
    const { root } = await withWorktree();
    git(root, "commit", "-q", "--allow-empty", "-m", "más");
    const ahead = git(root, "rev-parse", "HEAD");
    const repo = createGit(root, testEnv());
    const other = repo.inWorktree(await listedOn(repo, "otro"));
    expect(await other.head()).not.toBe(ahead);
    await repo.run(["update-ref", "refs/heads/otro", ahead]);
    expect(await other.head()).toBe(ahead);
  });

  it("AC3: a command of a folder's Git makes the session's Git and the other folders' ask again", async () => {
    stopClock();
    const { root } = await withWorktree();
    const repo = createGit(root, testEnv());
    const folder = await listedOn(repo, "otro");
    const other = repo.inWorktree(folder);
    const again = repo.inWorktree(folder);
    expect(await other.branch()).toBe("otro");
    expect(await again.branch()).toBe("otro");
    await other.run(["switch", "-q", "-c", "nueva"]);
    expect(await other.branch()).toBe("nueva");
    expect(await again.branch()).toBe("nueva");
    expect(await listedOn(repo, "nueva")).toBe(folder);
  });

  it("AC3: forgetting makes every folder's Git ask again, after another process changed them", async () => {
    stopClock();
    const { root } = await withWorktree();
    const repo = createGit(root, testEnv());
    const folder = await listedOn(repo, "otro");
    const other = repo.inWorktree(folder);
    const before = await other.head();
    git(folder, "commit", "-q", "--allow-empty", "-m", "fuera");
    expect(await other.head()).toBe(before);
    repo.forget();
    expect(await other.head()).toBe(git(folder, "rev-parse", "HEAD"));
  });
});

/** A repository with `count` open changes, each in its own folder, and the first one's folder. */
async function withChanges(count: number) {
  const root = await tempRepo({ ".specty/config.yaml": CONFIG(), "src/app.ts": "export {};\n" });
  for (const title of ["Uno", "Dos", "Tres"].slice(0, count))
    expect((await cli(root, ["new", "--worktree", `Cambio ${title}`])).code).toBe(0);
  const [, first] = await createGit(root).worktrees();
  if (first === undefined) throw new Error("no change folder");
  return { root, folder: first.folder };
}

/** The git commands `specty <args>` runs in `cwd`, with the clock stopped. */
async function gitRuns(cwd: string, args: readonly string[]): Promise<string[]> {
  const trace = await traceFile();
  stopClock();
  try {
    expect((await cli(cwd, args, { env: { GIT_TRACE: trace } })).code).toBe(0);
  } finally {
    vi.useRealTimers();
  }
  return traced(trace);
}

describe("reading every change's folder", () => {
  it("AC1: status from a change's folder and next from the main one list the worktrees once, ask git neither for each folder's branch nor its paths, and run as many git commands with three folders as with one", async () => {
    const one = await withChanges(1);
    const three = await withChanges(3);
    // `status` lists them afresh once more to count the ghost folders (`sweepableGhosts`).
    for (const [where, args, listings] of [
      ["folder", ["status"], 2],
      ["root", ["next"], 1],
    ] as const) {
      const few = await gitRuns(one[where], args);
      const many = await gitRuns(three[where], args);
      const perFolder = many.filter(
        (ran) => ran.startsWith("symbolic-ref") || ran.startsWith("rev-parse --git-path"),
      );
      expect(perFolder, args[0]).toEqual([]);
      const listed = many.filter((ran) => ran.startsWith("worktree list"));
      expect(listed, args[0]).toHaveLength(listings);
      expect(many, args[0]).toHaveLength(few.length);
    }
  });
});
