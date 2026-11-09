// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { git, tempRepo, testEnv } from "../../test/support";
import { createGit, findRoot, openRepository } from "./git";
import { fromGit, parseWorktrees, startedIn } from "./git-folders";

/** A repository, with a source folder, and a worktree of it. */
async function withWorktree() {
  const root = await tempRepo({ "src/app.ts": "export const a = 1;\n" });
  const folder = join(root, ".worktrees", "otro");
  git(root, "worktree", "add", "-q", "-b", "otro", folder);
  return { root, folder };
}

/** What `git worktree list --porcelain` prints on Windows, with git's `/`. */
const WINDOWS_LISTING = [
  "worktree C:/Users/ana/repo",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree C:/Users/ana/repo/.worktrees/20261109-saludo",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/specty/20261109-saludo",
  "locked",
  "",
  "worktree C:/Users/ana/repo/.worktrees/suelta",
  "HEAD 3333333333333333333333333333333333333333",
  "detached",
  "",
  "worktree C:/Users/ana/repo/.worktrees/nueva",
  "HEAD 0000000000000000000000000000000000000000",
  "branch refs/heads/nueva",
  "locked la mueve a mano",
  "",
].join("\n");

describe("a path git gives", () => {
  it("AC1: is the platform's own on Windows: `C:/…` is `C:\\…`, and a relative one is resolved from where git was asked", () => {
    expect(fromGit("C:/Users/ana/repo", "C:\\Users\\ana", win32)).toBe("C:\\Users\\ana\\repo");
    expect(
      fromGit("C:/Users/ana/repo/.git/worktrees/otro/specty", "C:\\Users\\ana\\repo", win32),
    ).toBe("C:\\Users\\ana\\repo\\.git\\worktrees\\otro\\specty");
    expect(fromGit(".git/specty", "C:\\Users\\ana\\repo", win32)).toBe(
      "C:\\Users\\ana\\repo\\.git\\specty",
    );
    expect(fromGit("../.git/common", "C:\\Users\\ana\\repo\\src", win32)).toBe(
      "C:\\Users\\ana\\repo\\.git\\common",
    );
  });

  it("AC1: stays as git gives it on macOS and Linux", () => {
    expect(fromGit("/home/ana/repo", "/tmp", posix)).toBe("/home/ana/repo");
    expect(fromGit(".git/specty", "/home/ana/repo", posix)).toBe("/home/ana/repo/.git/specty");
  });

  it("AC1: the root and the paths of git's folder are the ones Node gives, from a subfolder and in a worktree", async () => {
    const { root, folder } = await withWorktree();
    expect(await findRoot(join(root, "src"))).toBe(root);
    expect(await findRoot(folder)).toBe(folder);
    const opened = await openRepository(join(root, "src"));
    expect(opened?.root).toBe(root);
    expect(opened?.known).toEqual({
      specty: join(root, ".git", "specty"),
      common: join(root, ".git", "common"),
    });
    const there = createGit(folder, testEnv());
    expect(await there.gitPath("specty/retro")).toBe(
      join(root, ".git", "worktrees", "otro", "specty", "retro"),
    );
    expect(await there.gitPath("config")).toBe(join(root, ".git", "config"));
  });
});

describe("the worktrees git lists", () => {
  it("AC2: come with their folder as the platform writes it on Windows, and their branch, HEAD and lock as before", () => {
    expect(parseWorktrees(WINDOWS_LISTING, "C:\\Users\\ana\\repo", win32)).toEqual([
      {
        folder: "C:\\Users\\ana\\repo",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
      },
      {
        folder: "C:\\Users\\ana\\repo\\.worktrees\\20261109-saludo",
        branch: "specty/20261109-saludo",
        locked: true,
        head: "2222222222222222222222222222222222222222",
      },
      {
        folder: "C:\\Users\\ana\\repo\\.worktrees\\suelta",
        head: "3333333333333333333333333333333333333333",
      },
      { folder: "C:\\Users\\ana\\repo\\.worktrees\\nueva", branch: "nueva", locked: true },
    ]);
  });

  it("AC2: are the ones git lists on macOS and Linux, the main one first", async () => {
    const { root, folder } = await withWorktree();
    git(root, "worktree", "lock", folder);
    const listed = await createGit(folder, testEnv()).worktrees();
    expect(listed).toEqual([
      { folder: root, branch: "main", head: git(root, "rev-parse", "main") },
      { folder, branch: "otro", locked: true, head: git(root, "rev-parse", "otro") },
    ]);
  });
});

describe("git with `-C` in front", () => {
  it("AC3: starts in the folder `-C` names, without it, so that on Windows it does not hold the folder it ran from", () => {
    const folder = "C:\\Users\\ana\\repo\\.worktrees\\20261109-saludo";
    expect(
      startedIn(folder, ["-C", "C:/Users/ana/repo", "worktree", "remove", folder], win32),
    ).toEqual({ cwd: "C:\\Users\\ana\\repo", args: ["worktree", "remove", folder] });
  });

  it("AC3: resolves a relative `-C` from the root, and each one from the one before", () => {
    expect(startedIn("/repo", ["-C", "src", "-C", "../docs", "status"], posix)).toEqual({
      cwd: "/repo/docs",
      args: ["status"],
    });
    expect(startedIn("C:\\repo", ["-C", "src", "status"], win32)).toEqual({
      cwd: "C:\\repo\\src",
      args: ["status"],
    });
  });

  it("AC3: leaves alone git without `-C` in front", () => {
    const args = ["-c", "core.quotepath=off", "status", "-C"];
    expect(startedIn("/repo", args, posix)).toEqual({ cwd: "/repo", args });
  });

  it("AC3: gets git's same answer, from git started in that folder without `-C`", async () => {
    const { root, folder } = await withWorktree();
    const trace = join(await mkdtemp(join(tmpdir(), "specty-trace2-")), "git.json");
    const there = createGit(folder, testEnv({ GIT_TRACE2_EVENT: trace }));
    expect(await there.output(["-C", root, "-C", "src", "rev-parse", "--show-prefix"])).toBe(
      "src/",
    );
    const started = (await readFile(trace, "utf8"))
      .split("\n")
      .filter((line) => line.includes('"event":"start"'))
      .map((line): { argv: string[] } => JSON.parse(line));
    expect(started.map(({ argv }) => argv.slice(1))).toEqual([["rev-parse", "--show-prefix"]]);
  });
});
