// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { patchPaths } from "../../src";

describe("patchPaths", () => {
  it("writes added and updated files, and deletes removed ones", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+export const added = 1;",
      "*** Update File: src/app.ts",
      "@@ export function greet() {",
      '-  return "Hi";',
      '+  return "Hello";',
      "*** Delete File: src/old.ts",
      "*** End Patch",
    ].join("\n");
    expect(patchPaths(patch)).toEqual({
      writes: ["src/new.ts", "src/app.ts"],
      deletes: ["src/old.ts"],
    });
  });

  it("writes the new path of a move and deletes the one it updated", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/app.py",
      "*** Move to: src/main.py",
      "@@ def greet():",
      '-print("Hi")',
      '+print("Hello")',
      "*** End Patch",
    ].join("\r\n");
    expect(patchPaths(patch)).toEqual({ writes: ["src/main.py"], deletes: ["src/app.py"] });
  });

  it("ignores headers inside file contents, and repeated paths", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: docs/patches.md",
      "+*** Delete File: src/app.ts",
      "*** Update File: src/a.ts",
      "@@",
      "+a",
      "*** Update File: src/a.ts",
      "@@",
      "+b",
      "*** End Patch",
    ].join("\n");
    expect(patchPaths(patch)).toEqual({ writes: ["docs/patches.md", "src/a.ts"], deletes: [] });
    expect(patchPaths("ls -la")).toEqual({ writes: [], deletes: [] });
  });
});
