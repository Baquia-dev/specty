// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { commandsFor, setupCommand, verifyCommands } from "../src/detect/project";
import type { Stack } from "../src/detect/stack";
import { upsertShellBlock } from "../src/install/git-hooks";
import { exists } from "../src/io/files";
import { parseNameStatus } from "../src/io/git";
import { cli, read, tempRepo, writeFiles } from "./support";

describe("specty init", () => {
  it("detects a pnpm project and writes config, AGENTS.md, CLAUDE.md and hooks", async () => {
    const root = await tempRepo({
      "package.json": JSON.stringify({
        name: "demo",
        scripts: { test: "vitest", lint: "biome check", check: "pnpm lint && pnpm test" },
        devDependencies: { typescript: "7" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: 9\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "packages/core/package.json": "{}\n",
      "CLAUDE.md": "Notas propias.\n",
    });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("TypeScript (pnpm)");
    const config = parse(await read(root, ".specty/config.yaml"));
    expect(config.verify).toMatchObject({ default: "pnpm test", full: "pnpm check" });
    const agents = await read(root, "AGENTS.md");
    expect(agents).toContain("<!-- specty:begin id=flow -->");
    expect(agents).toContain("- Paquetes: packages/core");
    expect(agents).toContain("## Mapa");
    expect(await read(root, "CLAUDE.md")).toBe("@AGENTS.md\n\nNotas propias.\n");
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    expect(settings.hooks.PreToolUse[0].hooks[0]).toMatchObject({ type: "command" });
    expect(await read(root, ".git/info/exclude")).toContain("/.claude/settings.local.json");
    expect(await read(root, ".git/hooks/pre-commit")).toContain("hook pre-commit");
    expect((await cli(root, ["doctor"])).code).toBe(0);
  });

  it("installs the check after each Bash command, and doctor misses it (AC7)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    for (const event of ["PostToolUse", "PostToolUseFailure"]) {
      expect(settings.hooks[event]).toMatchObject([
        { matcher: "Bash", hooks: [{ type: "command" }] },
      ]);
    }
    const hooks = {
      PreToolUse: settings.hooks.PreToolUse,
      PostToolUseFailure: settings.hooks.PostToolUseFailure,
    };
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({ ...settings, hooks }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Claude Code: falta la comprobación tras cada comando de Bash (PostToolUse); ejecuta `specty init`.",
    );
    expect((await cli(root, ["init"])).code).toBe(0);
    expect((await cli(root, ["doctor"])).out).toContain("Claude Code: guard instalado.");
  });

  it("lets the agent use worktrees without a prompt, keeping the permissions people wrote", async () => {
    const root = await tempRepo({
      "package.json": '{"name":"x","scripts":{"test":"true"}}\n',
      ".claude/settings.local.json": JSON.stringify({
        permissions: {
          allow: ["Bash(npm test)"],
          deny: ["Read(.env)"],
          ask: ["ExitWorktree(action:remove)", "Bash(rm *)"],
        },
      }),
    });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    expect((await cli(root, ["init"])).code).toBe(0);
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    expect(settings.permissions).toEqual({
      allow: ["Bash(npm test)", "EnterWorktree", "ExitWorktree"],
      deny: ["Read(.env)"],
      ask: ["Bash(rm *)"],
    });
    expect(settings.hooks.PreToolUse).toHaveLength(1);

    // The rule an earlier init wrote, alone in `ask`, leaves no `ask` behind.
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({
        ...settings,
        permissions: { allow: ["EnterWorktree"], ask: ["ExitWorktree(action:remove)"] },
      }),
    });
    expect((await cli(root, ["init"])).code).toBe(0);
    expect(JSON.parse(await read(root, ".claude/settings.local.json")).permissions).toEqual({
      allow: ["EnterWorktree", "ExitWorktree"],
    });
  });

  it("is idempotent and keeps what people wrote", async () => {
    const root = await tempRepo({
      "pubspec.yaml": "name: app\nflutter:\n  uses-material-design: true\n",
      "AGENTS.md": "# App\n\nRegla humana.\n",
    });
    await cli(root, ["init", "--language", "en", "--tools", "cursor"]);
    await writeFiles(root, { "AGENTS.md": `${await read(root, "AGENTS.md")}\nMás texto.\n` });
    await cli(root, ["init"]);
    const agents = await read(root, "AGENTS.md");
    expect(agents.match(/specty:begin id=flow/g)).toHaveLength(1);
    expect(agents).toContain("Regla humana.");
    expect(agents).toContain("Más texto.");
    expect(parse(await read(root, ".specty/config.yaml")).scope.generated).toContain("**/*.g.dart");
    expect(JSON.parse(await read(root, ".cursor/hooks.json")).hooks.preToolUse).toHaveLength(1);
    expect(await exists(`${root}/.claude/settings.local.json`)).toBe(false);
  });

  it("asks for git first", async () => {
    const outside = await cli(await mkdtemp(join(tmpdir(), "specty-nogit-")), ["init"]);
    expect(outside.code).toBe(2);
    expect(outside.out).toContain("git init");
  });
});

describe("detection and helpers", () => {
  it("derives verification commands from the stack", () => {
    const js = commandsFor({
      language: "typescript",
      frameworks: [],
      tool: "npm",
      scripts: { test: "x", typecheck: "y" },
    });
    expect(js).toEqual({ test: "npm test", typecheck: "npm run typecheck" });
    expect(verifyCommands(js)).toEqual({
      default: "npm test",
      full: "npm run typecheck && npm test",
    });
    expect(
      commandsFor({ language: "python", frameworks: ["django"], tool: "uv", scripts: {} }),
    ).toEqual({ test: "uv run python manage.py test" });
    expect(
      commandsFor({ language: "dart", frameworks: ["flutter"], tool: "flutter", scripts: {} }).lint,
    ).toBe("flutter analyze");
  });

  it("knows how to prepare a new worktree of each stack", () => {
    const of = (language: Stack["language"], tool?: string) =>
      setupCommand({
        language,
        frameworks: [],
        scripts: {},
        ...(tool !== undefined ? { tool } : {}),
      });
    expect(of("typescript", "pnpm")).toBe("pnpm install --prefer-offline");
    expect(of("javascript", "npm")).toBe("npm install");
    expect(of("typescript", "yarn")).toBe("yarn install");
    expect(of("typescript", "bun")).toBe("bun install");
    expect(of("dart", "flutter")).toBe("flutter pub get");
    expect(of("dart", "dart")).toBe("dart pub get");
    expect(of("python", "uv")).toBe("uv sync");
    expect(of("python", "poetry")).toBe("poetry install");
    expect(of("python", "pdm")).toBe("pdm install");
    expect(of("python", "pipenv")).toBe("pipenv install --dev");
    expect(of("php", "composer")).toBe("composer install");
    expect(of("ruby")).toBe("bundle install");
    expect(of("elixir")).toBe("mix deps.get");
    expect(of("go")).toBe("go mod download");
    for (const [language, tool] of [
      ["python", "pip"],
      ["rust", undefined],
      ["java", "maven"],
      ["kotlin", "gradlew"],
      ["csharp", "dotnet"],
      ["swift", undefined],
      ["cpp", undefined],
    ] as const) {
      expect(of(language, tool), language).toBeUndefined();
    }
  });

  it("parses git name-status output", () => {
    expect(
      parseNameStatus("M\0a.ts\0R100\0old.ts\0new.ts\0A\0b.ts\0D\0c.ts\0C75\0d.ts\0e.ts\0"),
    ).toEqual([
      { path: "a.ts", status: "modified" },
      { path: "new.ts", from: "old.ts", status: "renamed" },
      { path: "b.ts", status: "added" },
      { path: "c.ts", status: "deleted" },
      { path: "e.ts", status: "added" },
    ]);
  });

  it("replaces its shell block without touching the rest", () => {
    const first = upsertShellBlock(
      "#!/bin/sh\nnpx lint-staged\n",
      "# >>> specty >>>\nuno\n# <<< specty <<<",
    );
    const second = upsertShellBlock(first, "# >>> specty >>>\ndos\n# <<< specty <<<");
    expect(second).toBe("#!/bin/sh\nnpx lint-staged\n# >>> specty >>>\ndos\n# <<< specty <<<\n");
  });
});
