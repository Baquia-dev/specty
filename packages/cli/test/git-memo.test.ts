// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exists } from "../src/io/files";
import { createGit, openRepository } from "../src/io/git";
import { mayChangeRecalled, RECENT_MS } from "../src/io/git-memo";
import { call, serving } from "./server/support";
import { CONFIG, cli, git, tempRepo, testEnv } from "./support";

/** A repository, with a source folder, and a worktree of it. */
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

/** The git commands a `GIT_TRACE` file ran that start with `command`. */
async function traced(file: string, command: string): Promise<string[]> {
  if (!(await exists(file))) return [];
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter((line) => line.includes(`trace: built-in: git ${command}`));
}

/** What git itself answers for `name` in `folder`. */
const answer = (folder: string, name: string) =>
  resolve(folder, git(folder, "rev-parse", "--git-path", name));

/** Runs `body` with `GIT_TRACE` also in this process, as the question that opens a repository uses it. */
async function tracing<T>(file: string, body: () => Promise<T>): Promise<T> {
  process.env.GIT_TRACE = file;
  try {
    return await body();
  } finally {
    delete process.env.GIT_TRACE;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("opening a repository", () => {
  it("AC1: one question to git gives the root and the paths of specty/ and common/, from a subfolder and in a worktree", async () => {
    const { root, folder } = await withWorktree();
    for (const [dir, top] of [
      [join(root, "src"), root],
      [folder, folder],
    ] as const) {
      const trace = await traceFile();
      const opened = await tracing(trace, () => openRepository(dir));
      expect(opened?.root).toBe(top);
      const repo = createGit(top, testEnv({ GIT_TRACE: trace }), opened?.known);
      for (const name of ["specty/retro", "common/specty/locks/full-verification.json"])
        expect(await repo.gitPath(name)).toBe(answer(top, name));
      expect(await traced(trace, "rev-parse")).toHaveLength(1);
    }
  });

  it("AC1: a command opens each session with one question to git for the root and those paths", async () => {
    const root = await tempRepo({ ".specty/config.yaml": CONFIG(), "src/app.ts": "export {};\n" });
    const trace = await traceFile();
    await tracing(trace, () => cli(join(root, "src"), ["next"], { env: { GIT_TRACE: trace } }));
    const opened = await traced(trace, "rev-parse --show-toplevel");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("--git-path specty --git-path common");
    expect(await traced(trace, "rev-parse --git-path specty")).toEqual([]);
    expect(await traced(trace, "rev-parse --git-path common")).toEqual([]);
  });

  it("AC1: outside git there is no repository", async () => {
    expect(await openRepository(await mkdtemp(join(tmpdir(), "specty-nogit-")))).toBeUndefined();
  });
});

describe("what a Git recalls", () => {
  it("AC2: asks git once for the branch, HEAD, a key and the worktrees while it only reads", async () => {
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    for (let i = 0; i < 3; i++) {
      expect(await repo.branch()).toBe("main");
      expect(await repo.head()).toMatch(/^[0-9a-f]{40}$/);
      expect(await repo.config("user.name")).toBe("Ana");
      expect(await repo.config("nada.de.nada")).toBeUndefined();
      expect(await repo.worktrees()).toHaveLength(2);
      await repo.run(["status", "--porcelain"]);
      await repo.run(["-c", "core.quotePath=false", "ls-files"]);
    }
    expect(await traced(trace, "symbolic-ref --short -q HEAD")).toHaveLength(1);
    expect(await traced(trace, "rev-parse --verify -q HEAD")).toHaveLength(1);
    expect(await traced(trace, "config --get user.name")).toHaveLength(1);
    expect(await traced(trace, "config --get nada.de.nada")).toHaveLength(1);
    expect(await traced(trace, "worktree list")).toHaveLength(1);
  });

  it("AC3: asks again after a command of its own that can change them, and gives the new answer", async () => {
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    const before = await repo.head();
    expect(await repo.branch()).toBe("main");
    expect(await repo.config("user.name")).toBe("Ana");
    expect(await repo.worktrees()).toHaveLength(2);
    await repo.run(["switch", "-q", "-c", "otra"]);
    expect(await repo.branch()).toBe("otra");
    await repo.run(["commit", "-q", "--allow-empty", "-m", "otro"]);
    expect(await repo.head()).not.toBe(before);
    await repo.run(["config", "user.name", "Bea"]);
    expect(await repo.config("user.name")).toBe("Bea");
    await repo.run(["worktree", "add", "-q", "-b", "tercera", join(root, ".worktrees", "tercera")]);
    expect(await repo.worktrees()).toHaveLength(3);
    expect(await traced(trace, "symbolic-ref --short -q HEAD")).toHaveLength(2);
  });

  it("AC4: asks again once its answer is more than a while old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    await repo.branch();
    vi.setSystemTime(new Date(Date.now() + RECENT_MS - 1));
    await repo.branch();
    expect(await traced(trace, "symbolic-ref --short -q HEAD")).toHaveLength(1);
    vi.setSystemTime(new Date(Date.now() + 2));
    await repo.branch();
    expect(await traced(trace, "symbolic-ref --short -q HEAD")).toHaveLength(2);
  });
});

describe("which git commands can change what is recalled", () => {
  it("AC3: reading commands cannot; moving a ref, writing the configuration or a worktree can", () => {
    const reads = [
      ["-c", "core.quotePath=false", "ls-files", "-z"],
      ["rev-parse", "--verify", "-q", "HEAD"],
      ["config", "--get", "user.name"],
      ["symbolic-ref", "--short", "-q", "HEAD"],
      ["worktree", "list", "--porcelain"],
      ["diff", "--name-only", "HEAD"],
    ];
    const changes = [
      ["commit", "-q", "-m", "x"],
      ["switch", "-q", "otra"],
      ["config", "user.name", "Bea"],
      ["symbolic-ref", "HEAD", "refs/heads/otra"],
      ["symbolic-ref", "--delete", "HEAD"],
      ["worktree", "add", "carpeta"],
      ["merge", "--no-ff", "main"],
      ["update-ref", "refs/heads/x", "HEAD"],
      [],
    ];
    for (const args of reads) expect(mayChangeRecalled(args), args.join(" ")).toBe(false);
    for (const args of changes) expect(mayChangeRecalled(args), args.join(" ")).toBe(true);
  });
});

describe("the reads that depend only on refs", () => {
  it("AC1: opening a repository with commits also gives HEAD and its branch, which a Git then does not ask", async () => {
    const { root } = await withWorktree();
    const opened = await openRepository(root);
    expect(opened?.head).toEqual({ commit: git(root, "rev-parse", "HEAD"), branch: "main" });
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }), opened?.known, opened?.head);
    expect(await repo.branch()).toBe("main");
    expect(await repo.head()).toBe(opened?.head?.commit);
    expect(await repo.output(["rev-parse", "HEAD"])).toBe(opened?.head?.commit);
    expect(await traced(trace, "symbolic-ref")).toEqual([]);
    expect(await traced(trace, "rev-parse")).toEqual([]);
  });

  it("AC1: a command asks git neither for HEAD nor for its branch after opening its session", async () => {
    const root = await tempRepo({ ".specty/config.yaml": CONFIG(), "src/app.ts": "export {};\n" });
    const trace = await traceFile();
    await tracing(trace, () => cli(root, ["next"], { env: { GIT_TRACE: trace } }));
    expect(await traced(trace, "symbolic-ref --short -q HEAD")).toEqual([]);
    expect(await traced(trace, "rev-parse --verify -q HEAD")).toEqual([]);
  });

  it("AC1: without commits, or with HEAD detached, it opens as before and answers as git", async () => {
    const empty = await mkdtemp(join(tmpdir(), "specty-empty-"));
    git(empty, "init", "-q", "-b", "main");
    const unborn = await openRepository(empty);
    expect(unborn?.head).toBeUndefined();
    expect(unborn?.known.specty).toBe(answer(empty, "specty"));
    const { root } = await withWorktree();
    git(root, "switch", "-q", "--detach");
    const opened = await openRepository(root);
    expect(opened?.head?.branch).toBe("HEAD");
    const repo = createGit(root, testEnv(), opened?.known, opened?.head);
    expect(await repo.branch()).toBeUndefined();
    expect(await repo.head()).toBe(git(root, "rev-parse", "HEAD"));
  });

  it("AC2: a log, a ref, a merge base or a tree read again while nothing changes is asked once, also when it failed", async () => {
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    for (let i = 0; i < 3; i++) {
      await repo.run(["log", "-n", "5", "--format=%h"]);
      expect((await repo.run(["rev-parse", "--verify", "-q", "refs/heads/nada"])).code).not.toBe(0);
      await repo.run(["merge-base", "HEAD", "otro"]);
      await repo.run(["ls-tree", "-r", "HEAD"]);
    }
    for (const command of ["log", "rev-parse --verify -q refs/heads/nada", "merge-base", "ls-tree"])
      expect(await traced(trace, command), command).toHaveLength(1);
  });

  it("AC3: preparing files keeps what it recalls; a commit or a moved ref asks again", async () => {
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    const before = await repo.output(["log", "-n", "5", "--format=%h"]);
    await repo.run(["add", "-A"]);
    await repo.output(["log", "-n", "5", "--format=%h"]);
    expect(await traced(trace, "log")).toHaveLength(1);
    await repo.run(["commit", "-q", "--allow-empty", "-m", "otro"]);
    expect(await repo.output(["log", "-n", "5", "--format=%h"])).not.toBe(before);
    expect(await traced(trace, "log")).toHaveLength(2);
    expect((await repo.run(["rev-parse", "--verify", "-q", "refs/heads/nueva"])).code).not.toBe(0);
    await repo.run(["update-ref", "refs/heads/nueva", "HEAD"]);
    expect((await repo.run(["rev-parse", "--verify", "-q", "refs/heads/nueva"])).code).toBe(0);
  });

  it("AC6: forgetting what it recalls makes the next read ask git again", async () => {
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    await repo.run(["log", "-n", "1", "--format=%h"]);
    repo.forget();
    await repo.run(["log", "-n", "1", "--format=%h"]);
    expect(await traced(trace, "log")).toHaveLength(2);
  });

  it("AC6: the local server answers each request with what git says then, after another process wrote", async () => {
    const { root, server, headers } = await serving();
    try {
      const before = JSON.parse((await call(server.port, "/api/memory", headers)).body);
      expect(before.entries).toEqual([]);
      expect((await cli(root, ["memory", "add", "Una nota desde otra sesión"])).code).toBe(0);
      const after = JSON.parse((await call(server.port, "/api/memory", headers)).body);
      expect(after.entries.map((entry: { text: string }) => entry.text)).toEqual([
        "Una nota desde otra sesión",
      ]);
    } finally {
      await server.close();
    }
  });

  it("AC4: a read of a path of the index, or with its own environment, is asked each time", async () => {
    const { root } = await withWorktree();
    const trace = await traceFile();
    const repo = createGit(root, testEnv({ GIT_TRACE: trace }));
    const index = join(await mkdtemp(join(tmpdir(), "specty-index-")), "index");
    for (let i = 0; i < 2; i++) {
      await repo.run(["rev-parse", ":src/app.ts"]);
      await repo.run(["log", "-n", "1", "--format=%h"], { env: { GIT_INDEX_FILE: index } });
    }
    expect(await traced(trace, "rev-parse :src/app.ts")).toHaveLength(2);
    expect(await traced(trace, "log")).toHaveLength(2);
  });
});
