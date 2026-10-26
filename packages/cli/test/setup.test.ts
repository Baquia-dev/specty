// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { supportsNode } from "../src/commands/doctor";
import { commandsFor, setupCommand, verifyCommands } from "../src/detect/project";
import type { Stack } from "../src/detect/stack";
import { upsertShellBlock } from "../src/install/git-hooks";
import { exists } from "../src/io/files";
import { parseNameStatus } from "../src/io/git";
import { cli, read, tempRepo, writeFiles } from "./support";

/** The rules that leave the person's commands to Specty in Claude Code's auto mode. */
const PERSON_COMMANDS = ["approve", "accept", "close", "cancel", "reject"].map(
  (name) => `Bash(specty ${name} *)`,
);

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

  it("has doctor warn of the paths AGENTS.md cites that are gone, and check Node", async () => {
    const root = await tempRepo({
      "package.json": '{"name":"x","scripts":{"test":"true"}}\n',
      "src/app.ts": "1\n",
      ".gitignore": "dist/\n",
    });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    const notes =
      "\n## Notas\n\n- `src/app.ts`, `docs/viejo.md`, `dist/app.js`, `theme/` y `pnpm exec vitest run test/a.test.ts`.\n";
    await writeFiles(root, { "AGENTS.md": `${await read(root, "AGENTS.md")}${notes}` });
    const doctor = await cli(root, ["doctor"]);
    // A warning: AGENTS.md is the person's (AC1). Built files and fragments are fine (AC2).
    expect(doctor.code).toBe(0);
    expect(doctor.out).toContain("AGENTS.md cita rutas que no existen: `docs/viejo.md`.");
    expect(doctor.out).not.toContain("`dist/app.js`");
    expect(doctor.out).toContain(`Node ${process.versions.node}.`);
    // From Node 22 on (AC3).
    expect([supportsNode("22.0.0"), supportsNode("24.1.0"), supportsNode("20.11.1")]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("has doctor warn, without failing, of the Map and Conventions still empty (AC1, AC2)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    const fresh = await cli(root, ["doctor"]);
    expect(fresh.code).toBe(0);
    expect(fresh.out).toContain(
      "AVISOS:\n  AGENTS.md tiene sin completar «Mapa» y «Convenciones»: el agente lo lee en cada sesión",
    );
    const agents = await read(root, "AGENTS.md");
    const map = agents.replace("## Mapa\n", "## Mapa\n\n- `gen/`: generado, no se toca.\n");
    await writeFiles(root, { "AGENTS.md": map });
    const half = (await cli(root, ["doctor"])).out;
    expect(half).toContain("AGENTS.md tiene sin completar «Convenciones»:");
    expect(half).not.toContain("«Mapa»");
    const both = map.replace("## Convenciones\n", "## Convenciones\n\n- Un test por archivo.\n");
    await writeFiles(root, { "AGENTS.md": both });
    expect((await cli(root, ["doctor"])).out).not.toContain("sin completar");
    // Without those sections there is nothing to warn of: the rest of AGENTS.md is the person's.
    await writeFiles(root, { "AGENTS.md": agents.slice(0, agents.indexOf("## Mapa")) });
    const without = await cli(root, ["doctor"]);
    expect([without.code, without.out]).toEqual([0, expect.not.stringContaining("sin completar")]);
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

  it("installs the worktree hooks without a matcher, and doctor misses them (AC5)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    for (const event of ["WorktreeCreate", "WorktreeRemove"]) {
      expect(settings.hooks[event]).toEqual([
        {
          hooks: [
            { type: "command", command: expect.stringContaining("guard --tool claude-code") },
          ],
        },
      ]);
    }
    const hooks = { ...settings.hooks, WorktreeRemove: [] };
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({ ...settings, hooks }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Claude Code: faltan los hooks de las worktrees (WorktreeRemove), así que `EnterWorktree` por nombre no entra en la carpeta del cambio; ejecuta `specty init`.",
    );
    expect(doctor.out).not.toContain("comprobación tras cada comando");
    expect((await cli(root, ["init"])).code).toBe(0);
    expect((await cli(root, ["doctor"])).out).toContain("Claude Code: guard instalado.");
  });

  it("installs the card after a compaction, and doctor misses it", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    expect(settings.hooks.SessionStart).toMatchObject([
      { matcher: "compact", hooks: [{ type: "command" }] },
    ]);
    const hooks = { ...settings.hooks, SessionStart: [] };
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({ ...settings, hooks }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Claude Code: falta la tarjeta de Specty tras compactar (SessionStart); ejecuta `specty init`.",
    );
    expect(doctor.out).not.toContain("comprobación tras cada comando");
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
      allow: ["Bash(npm test)", "EnterWorktree", "ExitWorktree", ...PERSON_COMMANDS],
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
      allow: ["EnterWorktree", "ExitWorktree", ...PERSON_COMMANDS],
    });
  });

  it("leaves the person's commands to Specty, which still blocks them without delegation (AC1, AC3, AC5)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
    expect(init.out).toContain(
      "Claude Code: permisos en .claude/settings.local.json (local) para que el agente ejecute `specty approve`, `accept`, `close`, `cancel` y `reject` sin el veto de Claude Code; Specty se los bloquea salvo en modo delegado.",
    );
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    expect(settings.permissions.allow).toEqual(expect.arrayContaining([...PERSON_COMMANDS]));
    expect(JSON.stringify(settings.permissions)).not.toMatch(/delegate|uninstall/);
    // Claude Code lets the command through, and Specty's guard still decides (AC3).
    const approve = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        cwd: root,
        tool_name: "Bash",
        tool_input: { command: "specty approve" },
      }),
    });
    expect(approve.code).toBe(2);
    expect(approve.err).toContain("`specty approve` lo ejecuta el usuario en su terminal");
    expect((await cli(root, ["doctor"])).out).not.toContain("faltan los permisos");

    const allow = ["EnterWorktree", "ExitWorktree", "Bash(specty approve *)"];
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({ ...settings, permissions: { allow } }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Claude Code: faltan los permisos de los comandos de la persona, así que su modo auto puede vetárselos al agente aunque Specty se los permita; ejecuta `specty init`.",
    );
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
