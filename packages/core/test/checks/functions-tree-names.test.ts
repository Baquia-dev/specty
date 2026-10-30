// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import { treeFunctions } from "../../src";

const require = createRequire(import.meta.url);
const source = (...lines: string[]) => `${lines.join("\n")}\n`;

const parsers = new Map<string, Parser>();

beforeAll(async () => {
  await Parser.init();
  for (const grammar of ["typescript", "javascript"]) {
    const parser = new Parser();
    const wasm = require.resolve(`@repomix/tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
    parser.setLanguage(await Language.load(wasm));
    parsers.set(grammar, parser);
  }
});

function measure(language: "typescript" | "javascript", text: string) {
  const tree = parsers.get(language)?.parse(text);
  if (tree === null || tree === undefined) throw new Error("tree-sitter gave no tree");
  try {
    return treeFunctions(language, tree.rootNode);
  } finally {
    tree.delete();
  }
}

describe("treeFunctions, names and rows", () => {
  it("names a function by its own name or by what receives it, and a callback by nothing", () => {
    const text = source(
      "class Panel {",
      "  #close() {",
      "    return 1;",
      "  }",
      "  handler = () => 2;",
      "}",
      "const actions = {",
      '  "open": function () {',
      "    return 3;",
      "  },",
      "};",
      "this.render = function () {",
      "  return 4;",
      "};",
      "const { picked } = { picked: () => 5 };",
      "[1].map((item) => item);",
    );
    expect(measure("typescript", text).map((found) => found.name)).toEqual([
      "#close",
      "handler",
      "open",
      "render",
      "picked",
      undefined,
    ]);
  });

  it("counts no blank row inside a string, no comment and no inserted semicolon", () => {
    const text = source(
      "function quote() {",
      "  let text = `a",
      "",
      "b`",
      "",
      "  // a note",
      "  return text",
      "}",
    );
    expect(measure("javascript", text)).toEqual([
      { name: "quote", start: 1, end: 8, lines: 5, complexity: 1 },
    ]);
  });
});
