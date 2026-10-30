// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import { treeFunctions } from "../../src";

const require = createRequire(import.meta.url);
const source = (...lines: string[]) => `${lines.join("\n")}\n`;

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser();
  const wasm = require.resolve("@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm");
  parser.setLanguage(await Language.load(wasm));
});

function measure(text: string) {
  const tree = parser.parse(text);
  if (tree === null) throw new Error("tree-sitter gave no tree");
  try {
    expect(tree.rootNode.hasError).toBe(false);
    return treeFunctions("kotlin", tree.rootNode);
  } finally {
    tree.delete();
  }
}

describe("treeFunctions in Kotlin", () => {
  it("AC2: measures a fun past its annotation, its lambda, and a getter named by its property", () => {
    const text = source(
      "class Orders {",
      "  @JvmStatic",
      "  fun total(x: Int): Int {",
      "    // the total",
      "    val twice = { y: Int -> if (y > 0) y else 0 }",
      "    for (y in 0..x) {",
      "      if (y > 0 && y < 9 || y == 3) return twice(y)",
      "    }",
      "    try { run() } catch (e: Exception) { return 0 }",
      "    return x",
      "  }",
      "  val size: Int",
      "    get() {",
      "      return 1",
      "    }",
      "}",
    );
    expect(measure(text)).toEqual([
      { name: "total", start: 3, end: 11, lines: 8, complexity: 6 },
      { name: "twice", start: 5, end: 5, lines: 1, complexity: 2 },
      { name: "size", start: 13, end: 15, lines: 3, complexity: 1 },
    ]);
  });
});
