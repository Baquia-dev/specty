// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Small limits, so that the functions of the tests stay short; `secrets` stays off. */
const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

/** A function of `body + branches + 3` lines of code and complexity `1 + branches`. */
const fn = (name: string, body: number, branches = 0, first = 0) =>
  [
    `export function ${name}(x) {`,
    ...Array.from({ length: branches }, (_, index) => `  if (x === ${index}) return ${index};`),
    ...Array.from({ length: body }, (_, index) => `  x += ${index + first};`),
    "  return x;",
    "}",
  ].join("\n");

async function repo(files: Readonly<Record<string, string>>, config = CHECKS): Promise<string> {
  return tempRepo({
    "package.json": `${JSON.stringify({ name: "app" })}\n`,
    ".specty/config.yaml": `${CONFIG()}${config}`,
    ...files,
  });
}

describe("the function checks of specty check", () => {
  it("fail on a function the change creates or grows past a limit, not on old debt", async () => {
    const root = await repo({
      "src/app.js": [fn("old", 5), fn("grown", 1), fn("busy", 0, 4), ""].join("\n\n"),
    });
    await writeFiles(root, {
      "src/app.js": [
        fn("old", 5, 0, 9),
        fn("grown", 4),
        fn("busy", 0, 4),
        fn("fresh", 0, 4),
        "",
      ].join("\n\n"),
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA function-lines",
        "  src/app.js:10 `grown` tiene 7 líneas de código (máximo 5)",
        "  src/app.js:26 `fresh` tiene 7 líneas de código (máximo 5)",
        "FALLA complexity",
        "  src/app.js:26 `fresh` tiene complejidad 5 (máximo 3)",
        "OK 5/7 · FALLA: function-lines, complexity",
      ].join("\n"),
    );
    const all = await cli(root, ["check", "--all"]);
    expect(all.out).toContain("  src/app.js:1 `old` tiene 8 líneas de código (máximo 5)");
    expect(all.out).toContain("  src/app.js:18 `busy` tiene complejidad 5 (máximo 3)");
  });

  it("speaks of a function with no name, and leaves tests out", async () => {
    const root = await repo({});
    await writeFiles(root, {
      "src/run.js": [
        "export default function () {",
        ...Array.from({ length: 6 }, (_, index) => `  step(${index});`),
        "}",
        "",
      ].join("\n"),
      "src/run.test.js": `describe("run", () => {\n${"  it('works', () => {});\n".repeat(8)}});\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toBe(
      [
        "FALLA function-lines",
        "  src/run.js:1 una función de 8 líneas de código (máximo 5)",
        "OK 6/7 · FALLA: function-lines",
      ].join("\n"),
    );
  });

  it("AC3: count both checks in a Mix project, whose functions the syntax tree measures", async () => {
    const elixir = await tempRepo({
      "mix.exs": "defmodule App.MixProject do\nend\n",
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off, tests: off }\n`,
    });
    await writeFiles(elixir, { "lib/app.ex": "defmodule App do\n  def f, do: 1\nend\n" });
    expect((await cli(elixir, ["check"])).out).toBe("OK 7/7");
  });

  it("measure Python by its indentation and Ruby by def … end (S4 AC1)", async () => {
    const root = await tempRepo({
      "pyproject.toml": '[project]\nname = "app"\n',
      Gemfile: 'source "https://rubygems.org"\n',
      ".specty/config.yaml": `${CONFIG()}${CHECKS.replace("{ secrets: off }", "{ secrets: off, tests: off }")}`,
    });
    const branches = Array.from(
      { length: 3 },
      (_, index) => `    if x == ${index}: return ${index}`,
    );
    await writeFiles(root, {
      "app/rules.py": ["def classify(x):", ...branches, "    return x", ""].join("\n"),
      "lib/steps.rb": [
        "def steps",
        ...Array.from({ length: 5 }, (_, i) => `  step ${i}`),
        "end",
        "",
      ].join("\n"),
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain(
      "FALLA function-lines\n  lib/steps.rb:1 `steps` tiene 7 líneas de código (máximo 5)",
    );
    expect(run.out).toContain(
      "FALLA complexity\n  app/rules.py:1 `classify` tiene complejidad 4 (máximo 3)",
    );
  });

  it("says it in English", async () => {
    const root = await repo({}, `${CHECKS}`);
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${CHECKS}`,
      "src/app.js": `${fn("fresh", 0, 4)}\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain("  src/app.js:1 `fresh` has 7 lines of code (max 5)");
    expect(run.out).toContain("  src/app.js:1 `fresh` has complexity 5 (max 3)");
  });
});
