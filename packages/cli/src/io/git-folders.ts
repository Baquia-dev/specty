// SPDX-License-Identifier: Apache-2.0

import type { PlatformPath } from "node:path";
import * as platformPath from "node:path";
import type { Worktree } from "./git";

/**
 * A path git gave, as the platform writes it: on Windows git writes `C:/Users/…` where Node, the
 * folders Specty builds and the person write `C:\Users\…`, and a path of one form is never equal
 * to one of the other. A relative one is relative to `base`, where git was asked. On macOS and
 * Linux, git's absolute paths stay as they are. `paths` is the platform's own but in tests.
 */
export function fromGit(path: string, base: string, paths: PlatformPath = platformPath): string {
  return paths.resolve(base, path);
}

/**
 * The worktrees `git worktree list --porcelain`, asked in `base`, prints: one block per worktree,
 * `worktree <folder>`, `HEAD <commit>`, then `branch refs/heads/…` unless it is detached, and
 * `locked`, with its reason or not, when it is locked. Each folder as the platform writes it.
 */
export function parseWorktrees(
  output: string,
  base: string,
  paths: PlatformPath = platformPath,
): Worktree[] {
  return output.split("\n\n").flatMap((block) => {
    const lines = block.split("\n");
    const value = (prefix: string) =>
      lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
    const folder = value("worktree ");
    const branch = value("branch refs/heads/");
    // A branch without commits yet has a HEAD of zeros.
    const head = value("HEAD ");
    if (folder === undefined) return [];
    const locked = lines.some((line) => line === "locked" || line.startsWith("locked "));
    return [
      {
        folder: fromGit(folder, base, paths),
        ...(branch === undefined ? {} : { branch }),
        ...(locked ? { locked } : {}),
        ...(head === undefined || /^0+$/.test(head) ? {} : { head }),
      },
    ];
  });
}

/** Where git starts, and with which arguments. */
interface Start {
  readonly cwd: string;
  readonly args: readonly string[];
}

/**
 * Where git `args` of a `Git` in `root` start: in the folder their `-C` in front name, each
 * resolved from the one before, and without them, as git would move there itself. On Windows,
 * git's launcher (`cmd\git.exe`) waits for the real git in the folder it was started in, which
 * git then cannot remove: `git -C <main> worktree remove <folder>` started in that folder failed.
 */
export function startedIn(
  root: string,
  args: readonly string[],
  paths: PlatformPath = platformPath,
): Start {
  let cwd = root;
  let at = 0;
  while (args[at] === "-C") {
    const folder = args[at + 1];
    if (folder === undefined) break;
    cwd = paths.resolve(cwd, folder);
    at += 2;
  }
  return { cwd, args: at === 0 ? args : args.slice(at) };
}
