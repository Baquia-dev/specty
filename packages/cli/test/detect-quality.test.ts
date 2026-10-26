// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { commandsFor, verifyCommands } from "../src/detect/project";
import { qualityCommands } from "../src/detect/quality";
import { detectStacks, type Stack } from "../src/detect/stack";
import { CONFIG, cli, tempRepo } from "./support";

/** The stack of `language` that `files` make, with its detected tools. */
async function stackOf(
  language: Stack["language"],
  files: Readonly<Record<string, string>>,
): Promise<Stack> {
  const stacks = await detectStacks(await tempRepo(files));
  const stack = stacks.find((candidate) => candidate.language === language);
  if (stack === undefined) throw new Error(`no ${language} stack`);
  return stack;
}

describe("the project's own quality tools", () => {
  it("in Python: black, flake8 and mypy, with the manager's prefix (AC1, AC3)", async () => {
    const stack = await stackOf("python", {
      "pyproject.toml":
        '[project]\nname = "app"\ndependencies = ["black>=24"]\n\n[tool.mypy]\nstrict = true\n',
      ".flake8": "[flake8]\nmax-line-length = 100\n",
      "uv.lock": "",
    });
    expect(commandsFor(stack)).toEqual({
      test: "uv run pytest",
      lint: "uv run flake8",
      typecheck: "uv run mypy .",
    });
    expect(qualityCommands(stack).format).toBe("uv run black --check .");
    expect(verifyCommands(commandsFor(stack)).full).toBe(
      "uv run flake8 && uv run mypy . && uv run pytest",
    );
  });

  it("in Python: ruff before flake8 and black, and pyright without mypy (AC1)", async () => {
    const stack = await stackOf("python", {
      "pyproject.toml": '[project]\nname = "app"\ndependencies = ["ruff"]\n\n[tool.pyright]\n',
      "setup.cfg": "[flake8]\nmax-line-length = 100\n",
    });
    expect(commandsFor(stack)).toEqual({
      test: "pytest",
      lint: "ruff check",
      typecheck: "pyright",
    });
    expect(qualityCommands(stack).format).toBe("ruff format --check");
  });

  it("in Python: nothing beyond the tests when no tool is configured (AC2)", async () => {
    const stack = await stackOf("python", {
      "requirements.txt": "blacklist-utils==1.0\nmypyc-helpers==2.0\n",
    });
    expect(commandsFor(stack)).toEqual({ test: "pytest" });
    expect(qualityCommands(stack)).toEqual({});
    expect(stack.tools).toBeUndefined();
  });

  it("in Ruby: RuboCop or Standard, and Sorbet or Steep (AC1)", async () => {
    const rubocop = await stackOf("ruby", {
      Gemfile: 'source "https://rubygems.org"\ngem "rubocop", require: false\n',
      "sorbet/config": "--dir\n.\n",
    });
    expect(commandsFor(rubocop)).toEqual({
      test: "bundle exec rspec",
      lint: "bundle exec rubocop",
      typecheck: "bundle exec srb tc",
    });
    const standard = await stackOf("ruby", {
      Gemfile: 'source "https://rubygems.org"\ngem "rubocop"\n',
      ".standard.yml": "ruby_version: 3.3\n",
      Steepfile: "target :lib do\nend\n",
    });
    expect(commandsFor(standard)).toMatchObject({
      lint: "bundle exec standardrb",
      typecheck: "bundle exec steep check",
    });
  });

  it("in PHP: the composer scripts first, and the configured tools without them (AC1)", async () => {
    const scripts = await stackOf("php", {
      "composer.json": JSON.stringify({
        scripts: { analyse: "phpstan analyse", lint: "phpcs", "cs:check": "php-cs-fixer check" },
      }),
      "phpstan.neon": "parameters:\n  level: 8\n",
    });
    expect(commandsFor(scripts)).toMatchObject({
      lint: "composer lint",
      typecheck: "composer analyse",
    });
    expect(qualityCommands(scripts).format).toBe("composer cs:check");
    const tools = await stackOf("php", {
      "composer.json": JSON.stringify({ "require-dev": { "laravel/pint": "^1.0" } }),
      "phpstan.neon.dist": "parameters:\n  level: 8\n",
      "phpcs.xml.dist": "<ruleset/>\n",
    });
    expect(qualityCommands(tools)).toEqual({
      format: "vendor/bin/pint --test",
      lint: "vendor/bin/phpcs",
      typecheck: "vendor/bin/phpstan analyse --no-progress",
    });
    const others = await stackOf("php", {
      "composer.json": "{}",
      "psalm.xml": "<psalm/>\n",
      ".php-cs-fixer.dist.php": "<?php return [];\n",
    });
    expect(qualityCommands(others)).toEqual({
      format: "vendor/bin/php-cs-fixer check",
      typecheck: "vendor/bin/psalm --no-progress",
    });
  });

  it("in Go: golangci-lint instead of go vet when it is configured (AC1, AC2)", async () => {
    const configured = await stackOf("go", {
      "go.mod": "module example.com/app\n",
      ".golangci.yml": 'version: "2"\n',
    });
    expect(commandsFor(configured)).toEqual({ test: "go test ./...", lint: "golangci-lint run" });
    const plain = await stackOf("go", { "go.mod": "module example.com/app\n" });
    expect(commandsFor(plain)).toEqual({ test: "go test ./...", lint: "go vet ./..." });
  });

  it("run in specty check, with the command the project has (AC1)", async () => {
    const root = await tempRepo({
      Gemfile: 'source "https://rubygems.org"\n',
      ".rubocop.yml": "AllCops:\n  NewCops: enable\n",
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off, tests: off }\n`,
    });
    const run = await cli(root, ["check", "--all", "--json"]);
    const report: { checks: { id: string; findings: { message: string }[] }[] } = JSON.parse(
      run.out,
    );
    const lint = report.checks.find((check) => check.id === "lint");
    // Without the gems installed, the command fails, and its report says which one ran.
    expect(lint?.findings[0]?.message).toContain("`bundle exec rubocop`");
  });
});
