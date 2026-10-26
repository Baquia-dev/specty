// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  AGENT_CAPABILITIES,
  type AgentTool,
  isAgentTool,
  matchesPattern,
  type ProjectFacts,
} from "@baquia-dev/specty-core";
import { parse as parseYaml } from "yaml";
import { exists, isDirectory, isRecord, parseJson, readText } from "../io/files";
import { pythonPrefix, qualityCommands } from "./quality";
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

/** How the stack's package manager runs one of its scripts: `npm run lint`, `pnpm lint`… */
export function scriptCommand(stack: Stack, script: string): string {
  const { tool } = stack;
  if (tool === "npm") return script === "test" ? "npm test" : `npm run ${script}`;
  return tool === "bun" ? `bun run ${script}` : `${tool} ${script}`;
}

/** The lint and type commands of the quality tools a stack configures (`quality.ts`). */
function lintAndTypes(stack: Stack): Pick<Commands, "lint" | "typecheck"> {
  const { lint, typecheck } = qualityCommands(stack);
  return {
    ...(lint === undefined ? {} : { lint }),
    ...(typecheck === undefined ? {} : { typecheck }),
  };
}

/** A JavaScript or TypeScript project's commands are the scripts of its `package.json`. */
function scriptCommands(stack: Stack): Commands {
  const pick = (...names: string[]) => names.find((script) => stack.scripts[script] !== undefined);
  const entry = (key: keyof Commands, ...names: string[]) => {
    const script = pick(...names);
    return script === undefined ? {} : { [key]: scriptCommand(stack, script) };
  };
  return {
    ...entry("test", "test"),
    ...entry("lint", "lint"),
    ...entry("typecheck", "typecheck", "type-check", "tsc"),
    ...entry("build", "build"),
    ...entry("check", "check", "verify", "ci"),
  };
}

/** The commands of each stack besides JavaScript's, before the quality tools it configures. */
const BASE: Readonly<
  Record<Exclude<Stack["language"], "typescript" | "javascript">, (stack: Stack) => Commands>
> = {
  dart: ({ tool }) =>
    tool === "flutter"
      ? { test: "flutter test", lint: "flutter analyze" }
      : { test: "dart test", lint: "dart analyze" },
  python: (stack) => ({
    test: `${pythonPrefix(stack)}${stack.frameworks.includes("django") ? "python manage.py test" : "pytest"}`,
  }),
  go: () => ({ test: "go test ./...", lint: "go vet ./..." }),
  rust: () => ({ test: "cargo test", lint: "cargo clippy -- -D warnings" }),
  csharp: () => ({ test: "dotnet test", build: "dotnet build", typecheck: "dotnet build" }),
  java: jvmTests,
  kotlin: jvmTests,
  ruby: ({ frameworks }) => ({
    test: frameworks.includes("rails") ? "bin/rails test" : "bundle exec rspec",
  }),
  php: phpTests,
  swift: () => ({ test: "swift test" }),
  elixir: () => ({ test: "mix test" }),
  cpp: () => ({ test: "ctest --test-dir build" }),
};

function jvmTests({ tool }: Stack): Commands {
  return {
    test: tool === "maven" ? "mvn test" : tool === "gradlew" ? "./gradlew test" : "gradle test",
  };
}

function phpTests({ frameworks, scripts }: Stack): Commands {
  if (frameworks.includes("laravel")) return { test: "php artisan test" };
  return { test: scripts.test !== undefined ? "composer test" : "vendor/bin/phpunit" };
}

/** The project's commands: its scripts, or each stack's own with the quality tools it configures. */
export function commandsFor(stack: Stack): Commands {
  if (stack.language === "typescript" || stack.language === "javascript") {
    return scriptCommands(stack);
  }
  return { ...BASE[stack.language](stack), ...lintAndTypes(stack) };
}

/** Install commands by tool, for stacks whose builds do not fetch dependencies on their own. */
const SETUP: Readonly<Record<string, string>> = {
  pnpm: "pnpm install --prefer-offline",
  npm: "npm install",
  yarn: "yarn install",
  bun: "bun install",
  flutter: "flutter pub get",
  dart: "dart pub get",
  uv: "uv sync",
  poetry: "poetry install",
  pdm: "pdm install",
  pipenv: "pipenv install --dev",
  composer: "composer install",
};

/** What prepares a new worktree of this stack (its dependencies), when it needs anything. */
export function setupCommand(stack: Stack): string | undefined {
  switch (stack.language) {
    case "ruby":
      return "bundle install";
    case "elixir":
      return "mix deps.get";
    case "go":
      return "go mod download";
    default:
      return stack.tool === undefined ? undefined : SETUP[stack.tool];
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
  // Each agent's marker files come from the capability table.
  const present = await Promise.all(
    Object.keys(AGENT_CAPABILITIES)
      .filter(isAgentTool)
      .map(async (tool) => {
        const paths: readonly string[] = AGENT_CAPABILITIES[tool].markers;
        const found = await Promise.all(paths.map((path) => exists(join(root, path))));
        return found.some(Boolean) ? [tool] : [];
      }),
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
