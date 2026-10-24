// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { removedAssertions } from "../../src";

/** A `git diff -U0` block for `path` with the given hunk lines. */
function block(path: string, lines: readonly string[], header = ""): string {
  return [
    `diff --git a/${path} b/${path}`,
    ...(header === "" ? [] : [header]),
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1,3 +1,2 @@",
    ...lines,
  ].join("\n");
}

describe("removedAssertions", () => {
  it("counts the assertions a test loses, net of the ones it gains", () => {
    const diff = block("src/app.test.ts", [
      "-  expect(greet('Ana')).toBe('Hola, Ana');",
      "-  expect(greet()).toBe('Hola, mundo');",
      "+  expect(greet('Ana')).toContain('Ana');",
      "-  const name = 'Ana';",
    ]);
    expect(removedAssertions(diff)).toEqual([{ path: "src/app.test.ts", removed: 1 }]);
  });

  it("recognises assertions in common frameworks", () => {
    const lines = [
      "-    assertEquals(1, total);",
      "-    assert total == 1",
      "-    assert_eq!(total, 1);",
      "-    XCTAssertEqual(total, 1)",
      "-    total.should.equal(1);",
      "-    assert.Equal(t, 1, total)",
      "-    require.NoError(t, err)",
      '-        t.Errorf("got %d", total)',
      "-    t.Fatal(err)",
      "-    expect(total, equals(1));",
    ];
    expect(removedAssertions(block("test/total_test.go", lines))).toEqual([
      { path: "test/total_test.go", removed: lines.length },
    ]);
  });

  it("takes a commented-out assertion as removed", () => {
    const diff = block("src/app.test.ts", [
      "-  expect(greet()).toBe('Hola, mundo');",
      "+  // expect(greet()).toBe('Hola, mundo');",
      "+  # assert total == 1",
    ]);
    expect(removedAssertions(diff)).toEqual([{ path: "src/app.test.ts", removed: 1 }]);
  });

  it("ignores assertions that only move or are reworded", () => {
    const diff = block("src/app.test.ts", [
      "-  expect(a).toBe(1);",
      "-  expect(b).toBe(2);",
      "+  expect(b).toBe(2);",
      "+  expect(a).toEqual(1);",
      "-it('should greet', () => {",
    ]);
    expect(removedAssertions(diff)).toEqual([]);
  });

  it("counts every assertion of a deleted test and keeps the path of a renamed one", () => {
    const deleted = [
      "diff --git a/src/old.test.ts b/src/old.test.ts",
      "deleted file mode 100644",
      "--- a/src/old.test.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-expect(1).toBe(1);",
      "--- not a header: a removed line inside the hunk",
      "-expect(2).toBe(2);",
    ].join("\n");
    const renamed = [
      "diff --git a/src/a.test.ts b/src/b.test.ts",
      "similarity index 90%",
      "rename from src/a.test.ts",
      "rename to src/b.test.ts",
      "--- a/src/a.test.ts",
      "+++ b/src/b.test.ts",
      "@@ -3 +2,0 @@",
      "-  expect(x).toBe(3);",
      "\\ No newline at end of file",
    ].join("\n");
    expect(removedAssertions(`${deleted}\n${renamed}\n`)).toEqual([
      { path: "src/b.test.ts", removed: 1 },
      { path: "src/old.test.ts", removed: 2 },
    ]);
  });

  it("finds nothing in an empty diff", () => {
    expect(removedAssertions("")).toEqual([]);
  });
});
