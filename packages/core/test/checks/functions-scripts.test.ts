// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { functionMetrics } from "../../src";

describe("functionMetrics in Python", () => {
  it("measures each def by its indentation, without blanks, comments or docstrings", () => {
    const text = [
      "import os",
      "",
      "def greet(name: str) -> str:",
      '    """Says hello.',
      "",
      "    Longer text.",
      '    """',
      "    # if this were code, it would count",
      "    if name and name != 'x':",
      "        return f'Hola {name}'",
      "    return 'Hola'",
      "",
      "class Greeter:",
      "    async def run(",
      "        self,",
      "        times: int,",
      "    ) -> None:",
      "        for _ in range(times):",
      "            try:",
      "                print('x' if times else 'y')",
      "            except ValueError:",
      "                pass",
      "",
      "def outer():",
      "    def inner(x):",
      "        return x or 1",
      "    return inner(2) if True else 0",
    ].join("\n");
    expect(functionMetrics("app/greet.py", text)).toEqual([
      { name: "greet", start: 3, end: 11, lines: 4, complexity: 3 },
      { name: "run", start: 14, end: 22, lines: 9, complexity: 4 },
      { name: "outer", start: 24, end: 27, lines: 4, complexity: 2 },
      { name: "inner", start: 25, end: 26, lines: 2, complexity: 2 },
    ]);
  });

  it("counts no branch in a string or a comment, and finds no function in a module without one", () => {
    const text = [
      "def say():",
      '    text = "if this and that or else"',
      "    note = '''for while",
      "    except case'''",
      "    return text  # if or and",
    ].join("\n");
    expect(functionMetrics("say.py", text)).toEqual([
      { name: "say", start: 1, end: 5, lines: 4, complexity: 1 },
    ]);
    expect(functionMetrics("settings.py", "DEBUG = True\nif DEBUG:\n    LEVEL = 1\n")).toEqual([]);
  });
});
