// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { createGit } from "../src/io/git";
import { git, tempRepo, testEnv } from "./support";

/** Paths under `specty/`, under `common/`, and of other folders of git. */
const NAMES = [
  "specty",
  "specty/retro",
  "specty/index-123-456",
  "common/specty/delegated.json",
  "common/specty/locks/full-verification.json",
  "info/exclude",
  "hooks/pre-commit",
];

/** A repository and a worktree of it. */
async function withWorktree() {
  const root = await tempRepo({ "src/app.ts": "export const a = 1;\n" });
  const folder = join(root, ".worktrees", "otro");
  git(root, "worktree", "add", "-q", "-b", "otro", folder);
  return { root, folder };
}

/** What git itself answers for `name` in `folder`. */
const answer = (folder: string, name: string) =>
  resolve(folder, git(folder, "rev-parse", "--git-path", name));

/** The lines of a `GIT_TRACE` file that ran `git <command>`. */
async function traced(file: string, command: string): Promise<string[]> {
  if (!(await exists(file))) return [];
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter((line) => line.includes(`trace: built-in: git ${command}`));
}

describe("the paths of git's folder", () => {
  it("are the ones git gives, in the main checkout and in a worktree (AC2)", async () => {
    const { root, folder } = await withWorktree();
    for (const dir of [root, folder]) {
      const repo = createGit(dir, testEnv());
      for (const name of NAMES) expect(await repo.gitPath(name)).toBe(answer(dir, name));
    }
  });

  it("come from one question to git for specty/ and one for common/ (AC1)", async () => {
    const { folder } = await withWorktree();
    const trace = join(await mkdtemp(join(tmpdir(), "specty-trace-")), "git.log");
    const repo = createGit(folder, testEnv({ GIT_TRACE: trace }));
    for (const name of [...NAMES.slice(1, 5), ...NAMES.slice(1, 5)]) await repo.gitPath(name);
    const asked = await traced(trace, "rev-parse --git-path");
    expect(asked.map((line) => line.split("--git-path ")[1])).toEqual(["specty", "common"]);
  });
});
