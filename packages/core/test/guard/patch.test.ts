// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { movePatch, patchPaths } from "../../src";

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

describe("movePatch", () => {
  it("moves the path of each header, and leaves the contents as they were (AC1)", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+*** Add File: not/a/header.ts",
      "*** Update File: src/app.ts",
      "*** Move to: src/moved.ts",
      "@@ export function greet() {",
      '-  return "Hi";',
      '+  return "Hello";',
      "*** Delete File: src/old.ts",
      "*** End Patch",
    ].join("\n");
    const moved = movePatch(patch, (path) => `/w/cambio/${path}`);
    expect(moved.split("\n")).toEqual([
      "*** Begin Patch",
      "*** Add File: /w/cambio/src/new.ts",
      "+*** Add File: not/a/header.ts",
      "*** Update File: /w/cambio/src/app.ts",
      "*** Move to: /w/cambio/src/moved.ts",
      "@@ export function greet() {",
      '-  return "Hi";',
      '+  return "Hello";',
      "*** Delete File: /w/cambio/src/old.ts",
      "*** End Patch",
    ]);
    expect(patchPaths(moved).writes).toEqual(["/w/cambio/src/new.ts", "/w/cambio/src/moved.ts"]);
    expect(movePatch(patch, (path) => path)).toBe(patch);
  });
});
