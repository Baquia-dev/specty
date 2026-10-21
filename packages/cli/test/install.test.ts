// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { detectStacks } from "../src/detect/stack";
import { resolveInvocation } from "../src/install/invocation";
import {
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  tryGit,
  writeFiles,
} from "./support";

describe("hook managers", () => {
  it("writes husky hooks, portable, next to existing ones", async () => {
    const root = await tempRepo({ ".husky/pre-commit": "npx lint-staged\n", "src/a.ts": "x\n" });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.out).toContain("(husky)");
    const hook = await read(root, ".husky/pre-commit");
    expect(hook).toContain("npx lint-staged");
    expect(hook).toContain("specty hook pre-commit");
    expect(await read(root, ".husky/prepare-commit-msg")).toContain(
      "specty hook prepare-commit-msg",
    );
  });

  it("adds commands to lefthook's configuration", async () => {
    const root = await tempRepo({
      "lefthook.yml": "pre-commit:\n  commands:\n    lint:\n      run: npm run lint\n",
    });
    await cli(root, ["init", "--language", "es"]);
    const config = parse(await read(root, "lefthook.yml"));
    expect(config["pre-commit"].commands.lint.run).toBe("npm run lint");
    expect(config["pre-commit"].commands.specty.run).toBe("specty hook pre-commit");
    expect((await cli(root, ["doctor"])).out).toContain("Hooks de git instalados.");
  });

  it("warns when a formatter would check .specty/ (AC5)", async () => {
    const root = await tempRepo({
      "biome.json": JSON.stringify({ files: { includes: ["**"] } }),
      "package.json": JSON.stringify({ name: "x", prettier: {} }),
    });
    await cli(root, ["init", "--language", "es"]);
    const warned = await cli(root, ["doctor"]);
    expect(warned.code).toBe(1);
    expect(warned.out).toContain(
      'Biome también revisa .specty/, que escribe Specty: añade "!.specty" en biome.json (files.includes).',
    );
    expect(warned.out).toContain("Prettier también revisa .specty/");

    await writeFiles(root, {
      "biome.json": JSON.stringify({ files: { includes: ["**", "!.specty"] } }),
      ".prettierignore": "dist\n.specty/\n",
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain("Biome excluye .specty/.");
    expect(fixed.out).toContain("Prettier excluye .specty/.");
    expect(fixed.out).not.toContain("también revisa .specty/");
  });

  it("explains what to add for simple-git-hooks", async () => {
    const root = await tempRepo({
      "package.json": JSON.stringify({ name: "x", "simple-git-hooks": {} }),
    });
    const result = await cli(root, ["init", "--language", "en"]);
    expect(result.out).toContain("Add to the simple-git-hooks configuration");
    expect((await cli(root, ["doctor"])).code).toBe(1);
  });
});

describe("in-process git hooks", () => {
  it("decide on staged code and add trailers to the message", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    await writeFiles(root, { "src/app.ts": "y\n" });
    git(root, "add", "src/app.ts");
    const blocked = await cli(root, ["hook", "pre-commit"]);
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain("sin una spec aprobada");
    git(root, "reset", "-q");
    git(root, "checkout", "--", "src/app.ts");
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    await writeFiles(root, { "src/app.ts": "manual\n" });
    git(root, "add", "src/app.ts");
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(0);
    const message = join(root, ".git", "MSG");
    await writeFile(message, "fix: retoque\n");
    expect((await cli(root, ["hook", "prepare-commit-msg", message, "message"])).code).toBe(0);
    expect(await read(root, ".git/MSG")).toContain("Specty-Manual: true");
    expect(tryGit(root, "commit", "-q", "-m", "x").status).toBe(0);
  });

  it("let ungoverned changes and git operations through", async () => {
    const root = await tempRepo({ "README.md": "x\n", ".specty/config.yaml": CONFIG() });
    await writeFiles(root, { "README.md": "y\n" });
    git(root, "add", "README.md");
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(0);
  });
});

describe("detection", () => {
  it("recognizes many stacks from their manifests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "specty-stacks-"));
    await writeFiles(dir, {
      "go.mod": "module x\n",
      "Cargo.toml": "[package]\n",
      "pyproject.toml": "[tool.ruff]\ndependencies = ['fastapi']\n",
      "uv.lock": "",
      Gemfile: "gem 'rails'\n",
      "composer.json": '{"require":{"laravel/framework":"11"}}',
      "Package.swift": "",
      "mix.exs": "phoenix",
      "CMakeLists.txt": "",
      "app.csproj": "",
      "build.gradle.kts": 'plugins { kotlin("jvm") }',
      gradlew: "",
    });
    const stacks = await detectStacks(dir);
    expect(stacks.map((stack) => stack.language)).toEqual([
      "swift",
      "kotlin",
      "csharp",
      "go",
      "rust",
      "python",
      "ruby",
      "php",
      "elixir",
      "cpp",
    ]);
    expect(stacks.find((stack) => stack.language === "python")).toMatchObject({
      tool: "uv",
      frameworks: ["fastapi", "ruff"],
    });
  });

  it("chooses how hooks call Specty", async () => {
    expect(await resolveInvocation(undefined, "/")).toEqual({ command: "specty", portable: true });
    expect(
      (await resolveInvocation("/home/x/.npm/_npx/abc/node_modules/.bin/specty", "/")).command,
    ).toBe("npx -y @baquia-dev/specty");
    const local = await resolveInvocation("/opt/specty/dist/specty.mjs", "/");
    expect(local).toEqual({
      command: 'node "/opt/specty/dist/specty.mjs"',
      portable: false,
      script: "/opt/specty/dist/specty.mjs",
    });
  });
});
