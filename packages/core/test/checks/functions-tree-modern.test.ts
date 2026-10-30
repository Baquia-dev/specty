// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import { type TreeLanguage, treeFunctions } from "../../src";

const require = createRequire(import.meta.url);
const source = (...lines: string[]) => `${lines.join("\n")}\n`;

const LANGUAGES = ["go", "rust", "swift", "dart"] as const;

const parsers = new Map<string, Parser>();

beforeAll(async () => {
  await Parser.init();
  for (const language of LANGUAGES) {
    const parser = new Parser();
    const wasm = require.resolve(`@repomix/tree-sitter-wasms/out/tree-sitter-${language}.wasm`);
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

describe("treeFunctions in Go, Rust, Swift and Dart", () => {
  it("AC3: measures a Go method, without the default of a switch and with its func literal", () => {
    const text = source(
      "package orders",
      "",
      "// Total adds them up.",
      "func (o *Orders) Total(x int) int {",
      "\ttwice := func(y int) int {",
      "\t\treturn y * 2",
      "\t}",
      "\tif x > 0 && x < 9 || x == 3 {",
      "\t\treturn twice(x)",
      "\t}",
      "\tswitch x {",
      "\tcase 1:",
      "\t\treturn 1",
      "\tdefault:",
      "\t\treturn 2",
      "\t}",
      "}",
    );
    expect(measure("go", text)).toEqual([
      { name: "Total", start: 4, end: 17, lines: 14, complexity: 5 },
      { start: 5, end: 7, lines: 3, complexity: 1 },
    ]);
  });

  it("AC3: measures a Rust fn past its attributes and without its doc comments", () => {
    const text = source(
      "/// Adds them up.",
      "#[inline]",
      "fn total(x: i32) -> i32 {",
      "    //! inner doc",
      "    let twice = |y: i32| {",
      "        if y > 0 { y } else { 0 }",
      "    };",
      "    for y in 0..x {",
      "        if y > 0 && y < 9 || y == 3 {",
      "            return twice(y);",
      "        }",
      "    }",
      "    while x > 0 {}",
      "    x",
      "}",
    );
    expect(measure("rust", text)).toEqual([
      { name: "total", start: 3, end: 15, lines: 12, complexity: 6 },
      { name: "twice", start: 5, end: 7, lines: 3, complexity: 2 },
    ]);
  });

  it("AC3: measures a Swift func past its attributes, with `guard` and `??` as branches", () => {
    const text = source(
      "@discardableResult",
      "func total(x: Int) -> Int {",
      "  /* the total */",
      "  let twice = { (y: Int) -> Int in",
      "    y > 0 ? y : 0",
      "  }",
      "  guard x > 0 && x < 9 || x == 3 else { return 0 }",
      "  switch x {",
      "  case 1: return twice(1)",
      "  default: return x ?? 0",
      "  }",
      "}",
    );
    expect(measure("swift", text)).toEqual([
      { name: "total", start: 2, end: 12, lines: 10, complexity: 6 },
      { name: "twice", start: 4, end: 6, lines: 3, complexity: 2 },
    ]);
  });

  it("AC3: measures a Dart method from its signature to the end of its body, and its getters", () => {
    const text = source(
      "class Orders {",
      "  @override",
      "  int total(int x) {",
      "    // the total",
      "    final twice = (int y) => y > 0 ? y : 0;",
      "    if (x > 0 && x < 9 || x == 3) return twice(x);",
      "    switch (x) {",
      "      case 1:",
      "        return 1;",
      "      default:",
      "        return x ?? 2;",
      "    }",
      "  }",
      "",
      "  int get size {",
      "    return 1;",
      "  }",
      "",
      "  List<int> get items => [",
      "        1,",
      "      ];",
      "}",
      "",
      "void main() {",
      "  int local() {",
      "    return 1;",
      "  }",
      "}",
    );
    expect(measure("dart", text)).toEqual([
      { name: "total", start: 3, end: 13, lines: 10, complexity: 6 },
      { name: "twice", start: 5, end: 5, lines: 1, complexity: 2 },
      { name: "size", start: 15, end: 17, lines: 3, complexity: 1 },
      { name: "items", start: 19, end: 21, lines: 3, complexity: 1 },
      { name: "main", start: 24, end: 28, lines: 5, complexity: 1 },
      { name: "local", start: 25, end: 27, lines: 3, complexity: 1 },
    ]);
  });
});
