// SPDX-License-Identifier: Apache-2.0
import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { endsWithName } from "./removals";

describe("the end of a worktree's path, as `git worktree remove` takes it", () => {
  it("AC3: on Windows, takes whole components with `\\` or `/`", () => {
    const folder = "C:\\Users\\ana\\repo\\.worktrees\\20261109-x";
    for (const name of [
      "20261109-x",
      ".worktrees\\20261109-x",
      ".worktrees/20261109-x",
      "20261109-x\\",
      "20261109-x/",
      "repo/.worktrees\\20261109-x",
    ]) {
      expect(endsWithName(folder, name, win32), name).toBe(true);
    }
    for (const name of ["x", "1109-x", "", "\\", "/", ".worktrees"]) {
      expect(endsWithName(folder, name, win32), name).toBe(false);
    }
  });

  it("AC3: on macOS and Linux, only `/` separates, as before", () => {
    const folder = "/home/ana/repo/.worktrees/20261109-x";
    for (const name of ["20261109-x", ".worktrees/20261109-x", "20261109-x/"]) {
      expect(endsWithName(folder, name, posix), name).toBe(true);
    }
    for (const name of [".worktrees\\20261109-x", "x", "", "/"]) {
      expect(endsWithName(folder, name, posix), name).toBe(false);
    }
  });
});
