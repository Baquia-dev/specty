// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { findingsInOutput } from "../../src";

const ROOT = "/work/app";
const lines = (...text: string[]) => text.join("\n");

describe("findingsInOutput", () => {
  it("reads the locations of tsc, Biome, Go, pytest and the Dart analyzer", () => {
    const output = lines(
      "src/app.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/api.ts:3:1 - error TS7006: Parameter 'x' implicitly has an 'any' type.",
      "src/app.ts:7:3 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━━━━━━━━━━",
      "  × Unexpected any. Specify a different type.",
      "./internal/store.go:12:5: undefined: cache",
      "tests/test_api.py:40: AssertionError",
      "   info • lib/app.dart:3:8 • Unused import: 'package:x/x.dart' • unused_import",
      "  error - lib/home.dart:9:1 - The name 'Foo' isn't defined - undefined_identifier",
    );
    expect(findingsInOutput(output, ROOT)).toEqual([
      {
        path: "src/app.ts",
        line: 12,
        message: "error TS2322: Type 'string' is not assignable to type 'number'.",
      },
      {
        path: "src/api.ts",
        line: 3,
        message: "error TS7006: Parameter 'x' implicitly has an 'any' type.",
      },
      { path: "src/app.ts", line: 7, message: "lint/suspicious/noExplicitAny" },
      { path: "internal/store.go", line: 12, message: "undefined: cache" },
      { path: "tests/test_api.py", line: 40, message: "AssertionError" },
      {
        path: "lib/app.dart",
        line: 3,
        message: "Unused import: 'package:x/x.dart' • unused_import",
      },
      {
        path: "lib/home.dart",
        line: 9,
        message: "The name 'Foo' isn't defined - undefined_identifier",
      },
    ]);
  });

  it("reads ESLint's default format, with the file on a line of its own", () => {
    const output = lines(
      "",
      "/work/app/src/app.ts",
      "  12:5  error    'x' is assigned a value but never used  no-unused-vars",
      "   3:1  warning  Unexpected console statement            no-console",
      "",
      "✖ 2 problems (1 error, 1 warning)",
    );
    expect(findingsInOutput(output, ROOT)).toEqual([
      {
        path: "src/app.ts",
        line: 12,
        message: "error 'x' is assigned a value but never used no-unused-vars",
      },
      { path: "src/app.ts", line: 3, message: "warning Unexpected console statement no-console" },
    ]);
  });

  it("takes the line before a bare location, as rustc and Vitest print them", () => {
    const output = lines(
      "error[E0425]: cannot find value `x` in this scope",
      " --> src/main.rs:4:13",
      "AssertionError: expected 1 to be 2",
      " ❯ test/app.test.ts:12:5",
    );
    expect(findingsInOutput(output, ROOT)).toEqual([
      {
        path: "src/main.rs",
        line: 4,
        message: "error[E0425]: cannot find value `x` in this scope",
      },
      { path: "test/app.test.ts", line: 12, message: "AssertionError: expected 1 to be 2" },
    ]);
  });

  it("drops colours and repeats, and takes no URL or version for a location", () => {
    const output = lines(
      "\u001b[36msrc/app.ts\u001b[39m:\u001b[33m1\u001b[39m:\u001b[33m1\u001b[39m - \u001b[31merror\u001b[39m bad",
      "src/app.ts:1:1 - error bad",
      "See https://example.com:8080/docs and node v22.1.0:3 for details",
    );
    expect(findingsInOutput(output, ROOT)).toEqual([
      { path: "src/app.ts", line: 1, message: "error bad" },
    ]);
  });

  it("gives the last lines when nothing has a location, and stops at 100", () => {
    const output = lines("Running 12 tests", "", "  3 failed", "  Error: database is down", "");
    expect(findingsInOutput(output, ROOT)).toEqual([
      { message: "Running 12 tests" },
      { message: "3 failed" },
      { message: "Error: database is down" },
    ]);
    const many = Array.from({ length: 150 }, (_, index) => `src/a${index}.ts:1:1 - error x`);
    expect(findingsInOutput(lines(...many), ROOT)).toHaveLength(100);
    expect(findingsInOutput("", ROOT)).toEqual([]);
  });
});
