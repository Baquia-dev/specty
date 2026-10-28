// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { cli, git, person, read, tempRepo } from "./support";

const LEGACY_CONFIG = [
  "version: 1",
  'language: "es"',
  'spec_engine: "builtin"',
  "scopes:",
  '  - path: "."',
  "    verify:",
  '      lint: "npm run lint"',
  '      test: "npm test"',
  '      build: "npm run build"',
  "governance:",
  "  source_paths:",
  '    - "src/**"',
  "  exempt_paths:",
  '    - "**/*.md"',
  '    - "docs/**"',
  "",
].join("\n");

/** A repository with the legacy installed: its config, rules, a change, a block and a hook. */
const LEGACY = {
  "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  "src/app.ts": "x\n",
  ".specty/config.yaml": LEGACY_CONFIG,
  ".specty/rules/core/workflow.md": "Reglas.\n",
  ".specty/changes/add-login/proposal.md": "# Add login\n\n## Why\nUsers need it.\n",
  "AGENTS.md":
    "# Demo\n\nNotas mías.\n\n<!-- specty:begin id=workflow hash=abc123 -->\nTexto del legacy.\n<!-- specty:end id=workflow -->\n",
  ".husky/pre-commit":
    "#!/bin/sh\nnpm test\n# >>> specty-hook >>>\n# Managed by specty (AI assistant governance)\nnpx --no-install @barcidev/specty check-approval --staged\n# <<< specty-hook <<<\n",
};

const INIT = ["init", "--language", "es", "--tools", "claude-code"];
const there = (root: string, path: string) => existsSync(join(root, path));

describe("init with the legacy installed", () => {
  it("AC1, AC4: migrates it step by step, then sets Specty up as always", async () => {
    const root = await tempRepo(LEGACY);
    const run = await cli(root, INIT, { terminal: person() });
    expect(run.code, run.out).toBe(0);
    expect(run.out).toContain("Instalación del legacy movida a .specty/legacy/");
    expect(run.out).toContain(
      "Cambios del legacy que se pueden traer con `specty import <carpeta>`: .specty/legacy/changes/add-login.",
    );
    expect(await read(root, ".specty/legacy/config.yaml")).toBe(LEGACY_CONFIG);
    expect(there(root, ".specty/legacy/rules/core/workflow.md")).toBe(true);
    expect(there(root, ".specty/legacy/changes/add-login/proposal.md")).toBe(true);
    expect(there(root, ".specty/rules")).toBe(false);
    expect(parse(await read(root, ".specty/config.yaml"))).toMatchObject({
      language: "es",
      governed: ["src/**"],
      ignored: ["**/*.md", "docs/**"],
      verify: { default: "npm test", full: "npm run lint && npm test && npm run build" },
    });
    const agents = await read(root, "AGENTS.md");
    expect(agents).toContain("Notas mías.");
    expect(agents).not.toContain("hash=abc123");
    expect(agents).not.toContain("Texto del legacy.");
    expect(agents).toContain("specty:begin id=flow");
    const hook = await read(root, ".husky/pre-commit");
    expect(hook).toContain("npm test");
    expect(hook).not.toContain("specty-hook");
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await cli(root, ["import"])).out).toContain(".specty/legacy/changes/add-login");
  });

  it("AC2: without a terminal, changes nothing and says it is the person's; a dry run lists the plan", async () => {
    const root = await tempRepo(LEGACY);
    const refused = await cli(root, INIT);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      "Este repositorio tiene una instalación del legacy (@barcidev/specty).",
    );
    const planned = await cli(root, [...INIT, "--dry-run"]);
    expect(planned.out).toContain("MIGRACIÓN DEL LEGACY (sin aplicar):");
    expect(planned.out).toContain(
      "mover a .specty/legacy/: .specty/changes, .specty/config.yaml, .specty/rules",
    );
    expect(planned.out).toContain("quitar los hooks de git del legacy: .husky/pre-commit");
    expect(there(root, ".specty/legacy")).toBe(false);
    expect(await read(root, ".specty/config.yaml")).toBe(LEGACY_CONFIG);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("AC3: declining the first step changes nothing; declining one of the others keeps only that", async () => {
    const root = await tempRepo(LEGACY);
    const declined = await cli(root, INIT, { terminal: person({ confirm: [false] }) });
    expect(declined.out).toContain("Migración del legacy cancelada: nada cambió.");
    expect(there(root, ".specty/legacy")).toBe(false);
    expect(await read(root, ".specty/config.yaml")).toBe(LEGACY_CONFIG);

    const partial = await cli(root, INIT, { terminal: person({ confirm: [true, false, true] }) });
    expect(partial.code, partial.out).toBe(0);
    expect(await read(root, ".husky/pre-commit")).toContain("specty-hook");
    expect(await read(root, "AGENTS.md")).not.toContain("hash=abc123");
    expect(there(root, ".specty/legacy/config.yaml")).toBe(true);
  });
});
