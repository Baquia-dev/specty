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
  parser.setLanguage(
    await Language.load(require.resolve("tree-sitter-elixir/tree-sitter-elixir.wasm")),
  );
});

function measure(text: string) {
  const tree = parser.parse(text);
  if (tree === null) throw new Error("tree-sitter gave no tree");
  try {
    expect(tree.rootNode.hasError).toBe(false);
    return treeFunctions("elixir", tree.rootNode);
  } finally {
    tree.delete();
  }
}

describe("treeFunctions in Elixir", () => {
  it("AC1: measures the calls that define functions, and the branches that are calls too", () => {
    const text = source(
      "defmodule Orders do",
      '  @doc """',
      "  Adds them up.",
      '  """',
      "  def total(x) when x > 0 do",
      "    # the sum",
      "    twice = fn y -> y * 2 end",
      "    unless x, do: 0",
      "    cond do",
      "      x > 9 -> 1",
      "      true -> 2",
      "    end",
      "    try do",
      "      run()",
      "    rescue",
      "      e in RuntimeError -> e",
      "    end",
      "    x && twice.(x) || 0",
      "  end",
      "",
      "  defp small(x), do: x",
      "end",
    );
    expect(measure(text)).toEqual([
      { name: "total", start: 5, end: 19, lines: 14, complexity: 7 },
      { name: "twice", start: 7, end: 7, lines: 1, complexity: 1 },
      { name: "small", start: 21, end: 21, lines: 1, complexity: 1 },
    ]);
  });

  it("AC2: counts each clause of a `case` as a branch", () => {
    const text = source(
      "defmodule Kinds do",
      "  defp kind(x) do",
      "    case x do",
      "      0 -> :zero",
      "      1 -> :one",
      "      2 -> :two",
      "      _ -> :many",
      "    end",
      "  end",
      "end",
    );
    expect(measure(text)).toEqual([{ name: "kind", start: 2, end: 9, lines: 8, complexity: 5 }]);
  });
});
