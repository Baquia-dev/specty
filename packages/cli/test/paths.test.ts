// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { posixRelative, repoPaths, shownPath } from "../src/store/paths";

// Windows' paths on any system: git gives `C:/…` and Node `C:\…`, and both must show with `/`.
vi.mock(
  "node:path",
  async () => (await vi.importActual<typeof import("node:path")>("node:path")).win32,
);

describe("paths as Specty shows them, on Windows", () => {
  it("relative to the repository, with / (AC1)", () => {
    // Files are still read and written with the system's separator.
    expect(repoPaths("C:\\repo").config).toBe("C:\\repo\\.specty\\config.yaml");
    expect(repoPaths("C:/repo").relative("C:\\repo\\.specty\\config.yaml")).toBe(
      ".specty/config.yaml",
    );
    expect(posixRelative("C:/work/repo", "C:\\work\\repo.worktrees\\x")).toBe(
      "../repo.worktrees/x",
    );
  });

  it("relative inside the root and whole outside it (AC1)", () => {
    expect(shownPath("C:/repo", "C:\\repo\\.github\\workflows\\specty-check.yml")).toBe(
      ".github/workflows/specty-check.yml",
    );
    expect(shownPath("C:\\repo", "D:\\other\\file.txt")).toBe("D:\\other\\file.txt");
    expect(shownPath("C:\\repo", "C:\\outside\\file.txt")).toBe("C:\\outside\\file.txt");
  });
});
