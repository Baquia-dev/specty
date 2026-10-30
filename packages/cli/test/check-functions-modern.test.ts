// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Small limits, so that the functions of the tests stay short; `secrets` stays off. */
const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

async function repo(files: Readonly<Record<string, string>>): Promise<string> {
  return tempRepo({
    "package.json": `${JSON.stringify({ name: "app" })}\n`,
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    ...files,
  });
}

function steps(count: number, line: string): string[] {
  return Array.from({ length: count }, () => line);
}

const text = (lines: readonly string[]) => `${lines.join("\n")}\n`;

/**
 * A function `run` with a parameter named `record`, of `body + 3` lines of code, in each language:
 * the line estimator takes `record` for a Java type declaration and does not see it.
 */
function records(body: number): Record<string, string> {
  return {
    "src/run.go": text([
      "package app",
      "",
      "func run(record int) int {",
      ...steps(body, "\trecord += 1"),
      "\treturn record",
      "}",
    ]),
    "src/run.rs": text([
      "fn run(mut record: i32) -> i32 {",
      ...steps(body, "    record += 1;"),
      "    record",
      "}",
    ]),
    "Sources/run.swift": text([
      "func run(record: Int) -> Int {",
      ...steps(body, "  print(record)"),
      "  return record",
      "}",
    ]),
    "lib/run.dart": text([
      "int run(int record) {",
      ...steps(body, "  record += 1;"),
      "  return record;",
      "}",
    ]),
  };
}

/** A Dart class with a getter of `body + 3` lines and another of `entries + 2`. */
function getters(body: number, entries: number): string {
  return text([
    "class Orders {",
    "  int get total {",
    "    var sum = 0;",
    ...steps(body - 1, "    sum += 1;"),
    "    return sum;",
    "  }",
    "",
    "  List<int> get items => [",
    ...steps(entries, "        1,"),
    "      ];",
    "}",
  ]);
}

describe("the function checks of specty check, in Go, Rust, Swift and Dart", () => {
  it("AC1: fail on a Dart getter, with a block or an arrow, that grows past the limit", async () => {
    const root = await repo({ "lib/orders.dart": getters(1, 1) });
    await writeFiles(root, { "lib/orders.dart": getters(5, 6) });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("  lib/orders.dart:2 `total` tiene 8 líneas de código (máximo 5)");
    expect(run.out).toContain("  lib/orders.dart:11 `items` tiene 8 líneas de código (máximo 5)");
  });

  it("AC2: fail on a function with a parameter named `record` that grows past the limit", async () => {
    const root = await repo(records(1));
    await writeFiles(root, records(5));
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    for (const at of ["src/run.go:3", "src/run.rs:1", "Sources/run.swift:1", "lib/run.dart:1"]) {
      expect(run.out).toContain(`  ${at} \`run\` tiene 8 líneas de código (máximo 5)`);
    }
  });
});
