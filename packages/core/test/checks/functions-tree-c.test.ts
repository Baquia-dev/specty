// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import { type TreeLanguage, treeFunctions } from "../../src";

const require = createRequire(import.meta.url);
const source = (...lines: string[]) => `${lines.join("\n")}\n`;

/** The grammar file of each language of the C family, in `@repomix/tree-sitter-wasms`. */
const FILES = { java: "java", csharp: "c_sharp", php: "php", c: "c", cpp: "cpp" } as const;

const parsers = new Map<string, Parser>();

beforeAll(async () => {
  await Parser.init();
  for (const [language, file] of Object.entries(FILES)) {
    const parser = new Parser();
    const wasm = require.resolve(`@repomix/tree-sitter-wasms/out/tree-sitter-${file}.wasm`);
    parser.setLanguage(await Language.load(wasm));
    parsers.set(language, parser);
  }
});

function measure(language: TreeLanguage, text: string) {
  const tree = parsers.get(language)?.parse(text);
  if (tree === null || tree === undefined) throw new Error("tree-sitter gave no tree");
  try {
    expect(tree.rootNode.hasError).toBe(false);
    return treeFunctions(language, tree.rootNode);
  } finally {
    tree.delete();
  }
}

describe("treeFunctions in the C family", () => {
  it("AC2: measures Java past its annotations, without the default of a switch", () => {
    const text = source(
      "class Orders {",
      "  @Override",
      "  public int total(int x) {",
      "    // the total",
      "    Runnable log = () -> {",
      "      if (x > 0) print();",
      "    };",
      "    if (x > 0 && x < 9 || x == 3) return 3;",
      "    switch (x) {",
      "      case 1: return 1;",
      "      default: return 2;",
      "    }",
      "  }",
      "}",
    );
    expect(measure("java", text)).toEqual([
      { name: "total", start: 3, end: 13, lines: 10, complexity: 5 },
      { name: "log", start: 5, end: 7, lines: 3, complexity: 2 },
    ]);
  });

  it("AC2: measures C# past its attributes, with its lambdas and its accessors", () => {
    const text = source(
      "class Orders {",
      "  [Pure]",
      "  public int Total(int x) {",
      "    /* the total */",
      "    Func<int, int> twice = y => y * 2;",
      "    switch (x) {",
      "      case 1: return 1;",
      "      default: return x ?? 0;",
      "    }",
      "  }",
      "  public int Size {",
      "    get {",
      "      return 1;",
      "    }",
      "  }",
      "}",
    );
    expect(measure("csharp", text)).toEqual([
      { name: "Total", start: 3, end: 10, lines: 7, complexity: 3 },
      { name: "twice", start: 5, end: 5, lines: 1, complexity: 1 },
      { start: 12, end: 14, lines: 3, complexity: 1 },
    ]);
  });

  it("AC2: measures PHP past its attributes, with `elseif` and `and` as branches", () => {
    const text = source(
      "<?php",
      "#[Pure]",
      "function total($x) {",
      "  // the total",
      "  $twice = fn($y) => $y * 2;",
      "  if ($x > 0 and $x < 9) {",
      "    return 1;",
      "  } elseif ($x) {",
      "    return 2;",
      "  }",
      "  switch ($x) {",
      "    case 1: return 3;",
      "    default: return 4;",
      "  }",
      "}",
    );
    expect(measure("php", text)).toEqual([
      { name: "total", start: 3, end: 15, lines: 12, complexity: 5 },
      { name: "twice", start: 5, end: 5, lines: 1, complexity: 1 },
    ]);
  });

  it("AC2: names a C function through its declarator, and a C++ one by its qualified name", () => {
    const c = source(
      "/* the total */",
      "static int *total(int x) {",
      "  // a note",
      "  switch (x) {",
      "  case 1:",
      "    return 0;",
      "  default:",
      "    break;",
      "  }",
      "  return x > 0 && x < 9 ? 0 : 0;",
      "}",
    );
    expect(measure("c", c)).toEqual([
      { name: "total", start: 2, end: 11, lines: 9, complexity: 4 },
    ]);
    const cpp = source(
      "int Orders::total(int x) {",
      "  auto twice = [](int y) { return y and y; };",
      "  for (auto y : ys) {",
      "    if (y || x) continue;",
      "  }",
      "  try { run(); } catch (Error e) { return 0; }",
      "  return x;",
      "}",
    );
    expect(measure("cpp", cpp)).toEqual([
      { name: "total", start: 1, end: 8, lines: 8, complexity: 5 },
      { name: "twice", start: 2, end: 2, lines: 1, complexity: 2 },
    ]);
  });
});
