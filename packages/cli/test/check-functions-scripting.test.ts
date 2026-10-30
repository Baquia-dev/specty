// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Small limits, so that the functions of the tests stay short; `secrets` stays off. */
const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

const text = (lines: readonly string[]) => `${lines.join("\n")}\n`;

async function repo(files: Readonly<Record<string, string>>): Promise<string> {
  return tempRepo({
    "package.json": `${JSON.stringify({ name: "app" })}\n`,
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    ...files,
  });
}

/** A Ruby method of `body + 4` lines of code that calls `range.end`, which is not its `end`. */
function span(body: number): string {
  const steps = Array.from({ length: body }, () => "  last += 1");
  return text(["def span(range)", "  last = range.end", ...steps, "  last", "end"]);
}

describe("the function checks of specty check, in Python and Ruby", () => {
  it("AC3: count every line of a Ruby method that calls `range.end`", async () => {
    const root = await repo({ "lib/span.rb": span(0) });
    await writeFiles(root, { "lib/span.rb": span(5) });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("  lib/span.rb:1 `span` tiene 9 líneas de código (máximo 5)");
  });

  it("AC4: take no Python variable named `case` for a branch", async () => {
    const root = await repo({});
    await writeFiles(root, {
      "app/pick.py": text([
        "def pick(items):",
        "    case = items[0]",
        "    case = case + 1",
        "    return case",
        "",
        "",
        "def classify(x):",
        "    if x == 0: return 0",
        "    if x == 1: return 1",
        "    if x == 2: return 2",
        "    return x",
      ]),
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain("  app/pick.py:7 `classify` tiene complejidad 4 (máximo 3)");
    expect(run.out).not.toContain("`pick`");
  });
});
