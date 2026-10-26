// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { exists, readText } from "../io/files";
import type { Stack } from "./stack";

/**
 * The quality tools a project already has, by the files that configure them or the manifest that
 * declares them, as each tool documents them: Specty runs the project's own tools and never adds
 * one. Python, Ruby, PHP and Go; the other stacks keep the commands of `commandsFor`.
 */

type Present = (dir: string) => Promise<boolean>;

const anyFile =
  (...names: string[]): Present =>
  async (dir) =>
    (await Promise.all(names.map((name) => exists(join(dir, name))))).some(Boolean);

const contains =
  (file: string, pattern: RegExp): Present =>
  async (dir) =>
    pattern.test((await readText(join(dir, file))) ?? "");

const either =
  (...checks: Present[]): Present =>
  async (dir) =>
    (await Promise.all(checks.map((check) => check(dir)))).some(Boolean);

/** A Python requirement named `name`, in `requirements.txt`, `pyproject.toml` or the Pipfile. */
function requirement(name: string): Present {
  const pattern = new RegExp(
    String.raw`(?:^|["'\s,[])${name}(?:\[[^\]]*\])?\s*(?:[=<>~!;,"'\]]|$)`,
    "im",
  );
  return either(
    ...["requirements.txt", "pyproject.toml", "Pipfile"].map((file) => contains(file, pattern)),
  );
}

const gem = (name: string) => contains("Gemfile", new RegExp(`^\\s*gem\\s+["']${name}["']`, "m"));

const TOOLS: Partial<Record<Stack["language"], readonly (readonly [string, Present])[]>> = {
  python: [
    ["black", either(contains("pyproject.toml", /^\[tool\.black\]/m), requirement("black"))],
    [
      "flake8",
      either(
        anyFile(".flake8"),
        contains("setup.cfg", /^\[flake8\]/m),
        contains("tox.ini", /^\[flake8\]/m),
      ),
    ],
    [
      "mypy",
      either(
        anyFile("mypy.ini", ".mypy.ini"),
        contains("pyproject.toml", /^\[tool\.mypy\]/m),
        contains("setup.cfg", /^\[mypy\]/m),
      ),
    ],
    [
      "pyright",
      either(anyFile("pyrightconfig.json"), contains("pyproject.toml", /^\[tool\.pyright\]/m)),
    ],
  ],
  ruby: [
    ["standard", either(anyFile(".standard.yml"), gem("standard"))],
    ["rubocop", either(anyFile(".rubocop.yml"), gem("rubocop"))],
    ["sorbet", anyFile("sorbet/config")],
    ["steep", anyFile("Steepfile")],
  ],
  php: [
    ["phpstan", anyFile("phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon")],
    ["psalm", anyFile("psalm.xml", "psalm.xml.dist")],
    ["phpcs", anyFile(".phpcs.xml", "phpcs.xml", ".phpcs.xml.dist", "phpcs.xml.dist")],
    ["pint", either(anyFile("pint.json"), contains("composer.json", /"laravel\/pint"\s*:/))],
    ["php-cs-fixer", anyFile(".php-cs-fixer.php", ".php-cs-fixer.dist.php")],
  ],
  go: [
    [
      "golangci-lint",
      anyFile(".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"),
    ],
  ],
};

/** The quality tools configured in `dir` for `stack`, by name. */
export async function qualityTools(dir: string, stack: Stack): Promise<readonly string[]> {
  const rules = TOOLS[stack.language] ?? [];
  const present = await Promise.all(rules.map(([, test]) => test(dir)));
  return rules.flatMap(([name], index) => (present[index] === true ? [name] : []));
}

export interface QualityCommands {
  readonly format?: string;
  readonly lint?: string;
  readonly typecheck?: string;
}

/** What runs a Python tool inside the project's environment: `uv run `, or nothing. */
export function pythonPrefix(stack: Stack): string {
  const { tool } = stack;
  if (tool === "uv" || tool === "poetry" || tool === "pdm") return `${tool} run `;
  return tool === "pipenv" ? "pipenv run " : "";
}

/** The format, lint and type commands of the tools `stack` has, each tool before its fallback. */
export function qualityCommands(stack: Stack): QualityCommands {
  const has = (tool: string) => stack.tools?.includes(tool) === true;
  switch (stack.language) {
    case "python":
      return python(stack, has);
    case "ruby":
      return defined("", {
        lint: has("standard")
          ? "bundle exec standardrb"
          : has("rubocop")
            ? "bundle exec rubocop"
            : undefined,
        typecheck: has("sorbet")
          ? "bundle exec srb tc"
          : has("steep")
            ? "bundle exec steep check"
            : undefined,
      });
    case "php":
      return php(stack, has);
    case "go":
      return defined("", { lint: has("golangci-lint") ? "golangci-lint run" : undefined });
    default:
      return {};
  }
}

function python(stack: Stack, has: (tool: string) => boolean): QualityCommands {
  const ruff = stack.frameworks.includes("ruff");
  return defined(pythonPrefix(stack), {
    format: ruff ? "ruff format --check" : has("black") ? "black --check ." : undefined,
    lint: ruff ? "ruff check" : has("flake8") ? "flake8" : undefined,
    typecheck: has("mypy") ? "mypy ." : has("pyright") ? "pyright" : undefined,
  });
}

/** The project's composer scripts first, then the configured tools. */
function php(stack: Stack, has: (tool: string) => boolean): QualityCommands {
  const script = (...names: string[]) => {
    const name = names.find((candidate) => stack.scripts[candidate] !== undefined);
    return name === undefined ? undefined : `composer ${name}`;
  };
  const tool = (name: string, command: string) => (has(name) ? command : undefined);
  return defined("", {
    format:
      script("cs:check", "format:check", "check:format", "fmt:check") ??
      tool("pint", "vendor/bin/pint --test") ??
      tool("php-cs-fixer", "vendor/bin/php-cs-fixer check"),
    lint: script("lint", "phpcs", "cs") ?? tool("phpcs", "vendor/bin/phpcs"),
    typecheck:
      script("analyse", "analyze", "phpstan", "psalm", "stan") ??
      tool("phpstan", "vendor/bin/phpstan analyse --no-progress") ??
      tool("psalm", "vendor/bin/psalm --no-progress"),
  });
}

/** The commands found, each with `prefix`. */
function defined(
  prefix: string,
  found: { readonly [K in keyof QualityCommands]?: string | undefined },
): QualityCommands {
  const result: { format?: string; lint?: string; typecheck?: string } = {};
  for (const key of ["format", "lint", "typecheck"] as const) {
    const command = found[key];
    if (command !== undefined) result[key] = `${prefix}${command}`;
  }
  return result;
}
