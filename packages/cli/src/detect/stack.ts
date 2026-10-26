// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { exists, isRecord, parseJson, readText } from "../io/files";
import { qualityTools } from "./quality";

/** A stack detected from manifest files in one directory. Inspired by the legacy detectors. */
export interface Stack {
  readonly language:
    | "typescript"
    | "javascript"
    | "dart"
    | "python"
    | "go"
    | "rust"
    | "csharp"
    | "java"
    | "kotlin"
    | "ruby"
    | "php"
    | "swift"
    | "elixir"
    | "cpp";
  readonly frameworks: readonly string[];
  /** npm, pnpm, yarn, bun; uv, poetry, pdm, pip; maven, gradle… */
  readonly tool?: string;
  /** Scripts declared in package.json or composer.json. */
  readonly scripts: Readonly<Record<string, string>>;
  /** The quality tools the project configures (`quality.ts`), when it has any. */
  readonly tools?: readonly string[];
}

const JS_FRAMEWORKS = [
  ["next", "next"],
  ["nuxt", "nuxt"],
  ["@angular/core", "angular"],
  ["@sveltejs/kit", "sveltekit"],
  ["svelte", "svelte"],
  ["astro", "astro"],
  ["react-native", "react-native"],
  ["expo", "expo"],
  ["react", "react"],
  ["vue", "vue"],
  ["@nestjs/core", "nest"],
  ["express", "express"],
  ["fastify", "fastify"],
  ["hono", "hono"],
  ["electron", "electron"],
  ["prisma", "prisma"],
] as const;

/** Stacks of a directory, most specific first (package.json often exists only for tooling). */
export async function detectStacks(dir: string): Promise<Stack[]> {
  const found = await Promise.all([
    dart(dir),
    swift(dir),
    jvm(dir),
    dotnet(dir),
    simple(dir, "go.mod", "go"),
    simple(dir, "Cargo.toml", "rust"),
    python(dir),
    simple(dir, "Gemfile", "ruby", ["rails"]),
    php(dir),
    simple(dir, "mix.exs", "elixir", ["phoenix"]),
    simple(dir, "CMakeLists.txt", "cpp"),
    javascript(dir),
  ]);
  const stacks = found.filter((stack): stack is Stack => stack !== undefined);
  return Promise.all(
    stacks.map(async (stack) => {
      const tools = await qualityTools(dir, stack);
      return tools.length > 0 ? { ...stack, tools } : stack;
    }),
  );
}

async function javascript(dir: string): Promise<Stack | undefined> {
  const pkg = parseJson(await readText(join(dir, "package.json")));
  if (!isRecord(pkg)) return undefined;
  const deps = { ...record(pkg.dependencies), ...record(pkg.devDependencies) };
  const typescript = "typescript" in deps || (await exists(join(dir, "tsconfig.json")));
  const frameworks = JS_FRAMEWORKS.filter(([name]) => name in deps).map(([, label]) => label);
  return {
    language: typescript ? "typescript" : "javascript",
    frameworks: [...new Set(frameworks)],
    tool: await jsTool(dir, pkg.packageManager),
    scripts: stringRecord(pkg.scripts),
  };
}

async function jsTool(dir: string, declared: unknown): Promise<string> {
  if (typeof declared === "string") return declared.split("@")[0] ?? "npm";
  const lockfiles = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ] as const;
  for (const [file, tool] of lockfiles) {
    if (await exists(join(dir, file))) return tool;
  }
  return "npm";
}

async function dart(dir: string): Promise<Stack | undefined> {
  const text = await readText(join(dir, "pubspec.yaml"));
  if (text === undefined) return undefined;
  const parsed: unknown = safeYaml(text);
  const pubspec = isRecord(parsed) ? parsed : {};
  const flutter = "flutter" in pubspec || "flutter" in record(pubspec.dependencies);
  return {
    language: "dart",
    frameworks: flutter ? ["flutter"] : [],
    tool: flutter ? "flutter" : "dart",
    scripts: {},
  };
}

async function python(dir: string): Promise<Stack | undefined> {
  const manifests = ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"];
  const texts = await Promise.all(manifests.map((file) => readText(join(dir, file))));
  if (texts.every((text) => text === undefined)) return undefined;
  const content = texts.join("\n").toLowerCase();
  const frameworks = ["django", "fastapi", "flask"].filter((name) => content.includes(name));
  const tools = [
    ["uv.lock", "uv"],
    ["poetry.lock", "poetry"],
    ["pdm.lock", "pdm"],
    ["Pipfile", "pipenv"],
  ] as const;
  const present = await Promise.all(
    tools.map(async ([file, tool]) => ((await exists(join(dir, file))) ? tool : undefined)),
  );
  const ruff = content.includes("ruff") ? ["ruff"] : [];
  return {
    language: "python",
    frameworks: [
      ...frameworks,
      ...ruff,
      ...((await exists(join(dir, "manage.py"))) && !frameworks.includes("django")
        ? ["django"]
        : []),
    ],
    tool: present.find((tool) => tool !== undefined) ?? "pip",
    scripts: {},
  };
}

async function jvm(dir: string): Promise<Stack | undefined> {
  if (await exists(join(dir, "pom.xml")))
    return { language: "java", frameworks: [], tool: "maven", scripts: {} };
  const gradle =
    (await readText(join(dir, "build.gradle.kts"))) ?? (await readText(join(dir, "build.gradle")));
  if (gradle === undefined) return undefined;
  const kotlin = /kotlin/i.test(gradle);
  return {
    language: kotlin ? "kotlin" : "java",
    frameworks: /com\.android/.test(gradle) ? ["android"] : [],
    tool: (await exists(join(dir, "gradlew"))) ? "gradlew" : "gradle",
    scripts: {},
  };
}

async function dotnet(dir: string): Promise<Stack | undefined> {
  const entries = await readdir(dir).catch(() => []);
  const project = entries.some((name) => /\.(?:csproj|fsproj|sln|slnx)$/.test(name));
  return project ? { language: "csharp", frameworks: [], tool: "dotnet", scripts: {} } : undefined;
}

async function php(dir: string): Promise<Stack | undefined> {
  const composer = parseJson(await readText(join(dir, "composer.json")));
  if (!isRecord(composer)) return undefined;
  const laravel = "laravel/framework" in record(composer.require);
  return {
    language: "php",
    frameworks: laravel ? ["laravel"] : [],
    tool: "composer",
    scripts: stringRecord(composer.scripts),
  };
}

async function swift(dir: string): Promise<Stack | undefined> {
  return (await exists(join(dir, "Package.swift")))
    ? { language: "swift", frameworks: [], scripts: {} }
    : undefined;
}

async function simple(
  dir: string,
  manifest: string,
  language: Stack["language"],
  frameworkHints: readonly string[] = [],
): Promise<Stack | undefined> {
  const text = await readText(join(dir, manifest));
  if (text === undefined) return undefined;
  const frameworks = frameworkHints.filter((hint) => text.toLowerCase().includes(hint));
  return { language, frameworks, scripts: {} };
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function safeYaml(text: string): unknown {
  try {
    return parseYaml(text);
  } catch {
    return undefined;
  }
}
