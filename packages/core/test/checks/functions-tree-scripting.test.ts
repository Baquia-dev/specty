// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import { functionMetrics, type TreeLanguage, treeFunctions } from "../../src";

const require = createRequire(import.meta.url);
const source = (...lines: string[]) => `${lines.join("\n")}\n`;

const parsers = new Map<string, Parser>();

beforeAll(async () => {
  await Parser.init();
  for (const language of ["python", "ruby"]) {
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

describe("treeFunctions in Python and Ruby", () => {
  it("AC1: measures Python as its estimator, without the docstring or the inside of a string", () => {
    const text = source(
      "@cache",
      "def total(items):",
      '    """Adds them up."""',
      "    # the sum",
      "    sql = '''",
      "        SELECT 1",
      "    '''",
      "",
      "    def twice(y):",
      "        return y * 2 if y else 0",
      "    picked = [y for y in items if y]",
      "    if items and len(items) > 1 or not sql:",
      "        return 0",
      "    elif items:",
      "        pass",
      "    try:",
      "        run()",
      "    except ValueError:",
      "        return 1",
      "    while picked:",
      "        picked.pop()",
      "    return twice(len(picked))",
    );
    const measured = measure("python", text);
    expect(measured).toEqual([
      { name: "total", start: 2, end: 22, lines: 16, complexity: 9 },
      { name: "twice", start: 9, end: 10, lines: 2, complexity: 2 },
    ]);
    expect(measured).toEqual(functionMetrics("app/total.py", text));
  });

  it("AC2: measures Ruby as its estimator, with its blocks inside the method", () => {
    const text = source(
      "def total(items)",
      "  # the sum",
      "  sum = 0",
      "  items.each do |item|",
      "    sum += item unless item.nil?",
      "  end",
      "  return 0 if sum > 9 && items.any? || sum.zero?",
      "  case sum",
      "  when 1 then 1",
      "  else 2",
      "  end",
      "  sum > 0 ? sum : 0",
      "rescue StandardError",
      "  0",
      "end",
      "",
      "def self.make = new",
    );
    const measured = measure("ruby", text);
    expect(measured).toEqual([
      { name: "total", start: 1, end: 15, lines: 14, complexity: 8 },
      { name: "make", start: 17, end: 17, lines: 1, complexity: 1 },
    ]);
    expect(measured).toEqual(functionMetrics("lib/total.rb", text));
  });
});
