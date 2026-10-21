// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { type AgentTool, matchesPattern, type ProjectFacts } from "@baquia-dev/specty-core";
import { parse as parseYaml } from "yaml";
import { exists, isDirectory, isRecord, parseJson, readText } from "../io/files";
import { detectStacks, type Stack } from "./stack";

export interface Commands {
  readonly test?: string;
  readonly lint?: string;
  readonly typecheck?: string;
  readonly build?: string;
  /** A script that runs every check (`check`, `verify`, `ci`). */
  readonly check?: string;
}

export interface Detection {
  readonly name: string;
  readonly stacks: readonly Stack[];
  readonly packages: readonly string[];
  readonly commands: Commands;
  readonly tools: readonly AgentTool[];
  /** Generated-code globs implied by the stack (scope.generated). */
  readonly generated: readonly string[];
}

const STACK_NAMES: Readonly<Record<Stack["language"], string>> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  dart: "Dart",
  python: "Python",
  go: "Go",
  rust: "Rust",
  csharp: ".NET",
  java: "Java",
  kotlin: "Kotlin",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  elixir: "Elixir",
  cpp: "C/C++",
};

export async function detectProject(root: string, name: string): Promise<Detection> {
  const stacks = await detectStacks(root);
  const primary = stacks[0];
  return {
    name,
    stacks,
    packages: await workspacePackages(root),
    commands: primary === undefined ? {} : commandsFor(primary),
    tools: await agentTools(root),
    generated: stacks.some((stack) => stack.language === "dart")
      ? ["**/*.g.dart", "**/*.freezed.dart", "**/*.gr.dart", "**/*.mocks.dart"]
      : [],
  };
}

export function commandsFor(stack: Stack): Commands {
  const { tool, scripts, frameworks } = stack;
  switch (stack.language) {
    case "typescript":
    case "javascript": {
      const runner = (script: string) =>
        tool === "npm"
          ? script === "test"
            ? "npm test"
            : `npm run ${script}`
          : tool === "bun"
            ? `bun run ${script}`
            : `${tool} ${script}`;
      const pick = (...names: string[]) => names.find((script) => scripts[script] !== undefined);
      const entry = (key: keyof Commands, ...names: string[]) => {
        const script = pick(...names);
        return script === undefined ? {} : { [key]: runner(script) };
      };
      return {
        ...entry("test", "test"),
        ...entry("lint", "lint"),
        ...entry("typecheck", "typecheck", "type-check", "tsc"),
        ...entry("build", "build"),
        ...entry("check", "check", "verify", "ci"),
      };
    }
    case "dart":
      return tool === "flutter"
        ? { test: "flutter test", lint: "flutter analyze" }
        : { test: "dart test", lint: "dart analyze" };
    case "python": {
      const prefix =
        tool === "uv" || tool === "poetry" || tool === "pdm"
          ? `${tool} run `
          : tool === "pipenv"
            ? "pipenv run "
            : "";
      const test = frameworks.includes("django")
        ? `${prefix}python manage.py test`
        : `${prefix}pytest`;
      return { test, ...(frameworks.includes("ruff") ? { lint: `${prefix}ruff check` } : {}) };
    }
    case "go":
      return { test: "go test ./...", lint: "go vet ./..." };
    case "rust":
      return { test: "cargo test", lint: "cargo clippy -- -D warnings" };
    case "csharp":
      return { test: "dotnet test", build: "dotnet build" };
    case "java":
    case "kotlin":
      return tool === "maven"
        ? { test: "mvn test" }
        : { test: tool === "gradlew" ? "./gradlew test" : "gradle test" };
    case "ruby":
      return { test: frameworks.includes("rails") ? "bin/rails test" : "bundle exec rspec" };
    case "php":
      return {
        test: frameworks.includes("laravel")
          ? "php artisan test"
          : scripts.test !== undefined
            ? "composer test"
            : "vendor/bin/phpunit",
      };
    case "swift":
      return { test: "swift test" };
    case "elixir":
      return { test: "mix test" };
    case "cpp":
      return { test: "ctest --test-dir build" };
  }
}

/** verify.default and verify.full for config.yaml. */
export function verifyCommands(commands: Commands): {
  readonly default?: string;
  readonly full?: string;
} {
  const chained = [commands.lint, commands.typecheck, commands.test].filter(
    (command): command is string => command !== undefined,
  );
  const full = commands.check ?? (chained.length > 1 ? chained.join(" && ") : undefined);
  return {
    ...(commands.test !== undefined ? { default: commands.test } : {}),
    ...(full !== undefined ? { full } : {}),
  };
}

export function projectFacts(detection: Detection): ProjectFacts {
  const stacks = detection.stacks.map((stack) => {
    const frameworks = stack.frameworks.filter((name) => name !== "ruff");
    const details = [...frameworks, ...(stack.tool !== undefined ? [stack.tool] : [])];
    return `${STACK_NAMES[stack.language]}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
  });
  const { commands } = detection;
  const labeled = [
    ["Tests", commands.test],
    ["Lint", commands.lint],
    ["Typecheck", commands.typecheck],
    ["Build", commands.build],
    ["Check", commands.check],
  ] as const;
  return {
    stacks,
    packages: detection.packages,
    commands: labeled.flatMap(([label, command]) =>
      command === undefined ? [] : [{ label, command }],
    ),
  };
}

async function workspacePackages(root: string): Promise<string[]> {
  const pnpm = safeYaml(await readText(join(root, "pnpm-workspace.yaml")));
  const melos = safeYaml(await readText(join(root, "melos.yaml")));
  const pkg = parseJson(await readText(join(root, "package.json")));
  const workspaces = isRecord(pkg) ? pkg.workspaces : undefined;
  const patterns = [
    ...strings(isRecord(pnpm) ? pnpm.packages : undefined),
    ...strings(isRecord(melos) ? melos.packages : undefined),
    ...strings(
      Array.isArray(workspaces)
        ? workspaces
        : isRecord(workspaces)
          ? workspaces.packages
          : undefined,
    ),
  ];
  const expanded = await Promise.all(patterns.map((pattern) => expand(root, pattern)));
  return [...new Set(expanded.flat())].toSorted();
}

/** Expands `dir/*` style workspace patterns into directories that exist. */
async function expand(root: string, pattern: string): Promise<string[]> {
  const clean = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!/[*?[{]/.test(clean)) return (await isDirectory(join(root, clean))) ? [clean] : [];
  const base = clean.slice(0, clean.search(/[*?[{]/)).replace(/\/[^/]*$/, "");
  const entries = await readdir(join(root, base), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => (base === "" ? entry.name : `${base}/${entry.name}`))
    .filter((path) => matchesPattern(path, clean));
}

async function agentTools(root: string): Promise<AgentTool[]> {
  const markers: readonly (readonly [AgentTool, readonly string[]])[] = [
    ["claude-code", [".claude", "CLAUDE.md"]],
    ["cursor", [".cursor", ".cursorrules"]],
    ["codex", [".codex"]],
    ["gemini-cli", [".gemini", "GEMINI.md"]],
    ["copilot", [".github/copilot-instructions.md", ".github/instructions"]],
    ["windsurf", [".windsurf", ".windsurfrules"]],
    ["antigravity", [".agents", ".agent"]],
  ];
  const present = await Promise.all(
    markers.map(async ([tool, paths]) =>
      (await Promise.all(paths.map((path) => exists(join(root, path))))).some(Boolean)
        ? [tool]
        : [],
    ),
  );
  return present.flat();
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeYaml(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return parseYaml(text);
  } catch {
    return undefined;
  }
}
