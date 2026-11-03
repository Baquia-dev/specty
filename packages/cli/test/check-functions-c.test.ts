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

/**
 * A function `run` with a parameter named `record`, of `body + 3` lines of code, in each language:
 * the line estimator takes `record` for a Java type declaration and does not see it.
 */
const SOURCES = {
  "src/Orders.java": (body: number) => [
    "class Orders {",
    "  int run(int record) {",
    ...steps(body, "    record += 1;"),
    "    return record;",
    "  }",
    "}",
  ],
  "src/Orders.cs": (body: number) => [
    "class Orders {",
    "  int run(int record) {",
    ...steps(body, "    record += 1;"),
    "    return record;",
    "  }",
    "}",
  ],
  "src/run.php": (body: number) => [
    "<?php",
    "function run($record) {",
    ...steps(body, "  $record += 1;"),
    "  return $record;",
    "}",
  ],
  "src/run.c": (body: number) => [
    "int run(int record) {",
    ...steps(body, "  record += 1;"),
    "  return record;",
    "}",
  ],
  "src/run.cpp": (body: number) => [
    "int run(int record) {",
    ...steps(body, "  record += 1;"),
    "  return record;",
    "}",
  ],
} as const;

function steps(count: number, line: string): string[] {
  return Array.from({ length: count }, () => line);
}

function files(body: number): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SOURCES).map(([path, lines]) => [path, `${lines(body).join("\n")}\n`]),
  );
}

describe("the function checks of specty check, in the C family", () => {
  it("AC1: fail on a function with a parameter named `record` that grows past the limit", async () => {
    const root = await repo(files(1));
    await writeFiles(root, files(5));
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    const places = [
      "src/Orders.java:2",
      "src/Orders.cs:2",
      "src/run.php:2",
      "src/run.c:1",
      "src/run.cpp:1",
    ];
    for (const at of places) {
      expect(run.out).toContain(`  ${at} \`run\` tiene 8 líneas de código (máximo 5)`);
    }
  });

  it("AC3: pair a function without a name by its order, so touching it is not growing it", async () => {
    const callback = (first: number) =>
      [
        "register(() => {",
        ...Array.from({ length: 6 }, (_, index) => `  step(${index + first});`),
        "});",
      ].join("\n");
    const fresh = [
      "export function fresh(x: number): number {",
      ...steps(4, "  x += 1;"),
      "  return x;",
      "}",
    ];
    const root = await repo({ "src/routes.ts": `${callback(0)}\n` });
    await writeFiles(root, { "src/routes.ts": `${callback(9)}\n\n${fresh.join("\n")}\n` });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain("`fresh` tiene 7 líneas de código (máximo 5)");
    expect(run.out).not.toContain("una función de");
  });
});
