// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import { functionMetrics, treeFunctions } from "../../src";

const require = createRequire(import.meta.url);
const source = (...lines: string[]) => `${lines.join("\n")}\n`;

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser();
  const grammar = require.resolve("@repomix/tree-sitter-wasms/out/tree-sitter-typescript.wasm");
  parser.setLanguage(await Language.load(grammar));
});

/** The functions of a TypeScript source, measured on its syntax tree. */
function measure(text: string) {
  const tree = parser.parse(text);
  if (tree === null) throw new Error("tree-sitter gave no tree");
  try {
    return treeFunctions("typescript", tree.rootNode);
  } finally {
    tree.delete();
  }
}

describe("treeFunctions", () => {
  it("AC3: takes a parameter type of several lines in braces as part of one function", () => {
    const declared = source(
      "export function render(",
      "  options: {",
      "    title: string;",
      "    width: number;",
      "  },",
      "): string {",
      "  return options.title;",
      "}",
    );
    expect(measure(declared)).toEqual([
      { name: "render", start: 1, end: 8, lines: 8, complexity: 1 },
    ]);
    const arrow = source(
      "export const view = ({",
      "  title,",
      "  width,",
      "}: {",
      "  title: string;",
      "  width: number;",
      "}) => {",
      "  return width > 0 ? title : '';",
      "};",
    );
    expect(measure(arrow)).toEqual([{ name: "view", start: 1, end: 9, lines: 9, complexity: 2 }]);
  });

  it("AC7: measures like the estimator a function it reads well", () => {
    const text = source(
      "class Store {",
      "  @memo()",
      "  load(items: readonly string[]): number {",
      "    // counts the loaded ones",
      "    let count = 0;",
      "",
      "    for (const item of items) {",
      '      if (item === "" || item === "-") continue;',
      "      /* a block",
      "         comment */",
      "      count += item.length > 3 ? 2 : 1;",
      "    }",
      "    items.forEach((item) => {",
      "      if (item) count += 1;",
      "    });",
      "    return count ?? 0;",
      "  }",
      "}",
    );
    const measured = measure(text);
    expect(measured).toEqual([
      { name: "load", start: 3, end: 17, lines: 11, complexity: 6 },
      { start: 13, end: 15, lines: 3, complexity: 2 },
    ]);
    expect(measured).toEqual(functionMetrics("src/store.ts", text));
  });
});
