// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, person, read, tempRepo, writeFiles } from "./support";

const GIT = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const WORKFLOW = ".github/workflows/specty-check.yml";

/** A TypeScript project with layers and no dependency-cruiser; `secrets` stays off. */
const LAYERED = [
  "# Las verificaciones de este proyecto.",
  "checks:",
  "  levels: { secrets: off }",
  "  layers:",
  '    domain: { paths: ["src/domain/**"] }',
  "",
].join("\n");

async function typescript(config = LAYERED): Promise<string> {
  return tempRepo({
    "package.json": json({ name: "app", devDependencies: { typescript: "5.9.0" } }),
    "tsconfig.json": json({ compilerOptions: { strict: true } }),
    "src/domain/user.ts": "export const user = 1;\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
  });
}

describe("specty check --install", () => {
  it("shows every diff and command with --dry-run, and writes nothing", async () => {
    const root = await typescript();
    const run = await cli(root, ["check", "--install", "--dry-run"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(".specty/config.yaml (modificar)");
    expect(run.out).toContain("+  preCommit: true");
    expect(run.out).toContain(`${WORKFLOW} (crear)`);
    expect(run.out).toMatch(
      /\+ {8}run: npx -y @baquia-dev\/specty@\d+\.\d+\.\d+ check --all --json/,
    );
    expect(run.out).toContain("npm install --save-dev --save-exact dependency-cruiser@18.7.0");
    expect(run.out).toContain("Para aplicarlo, ejecuta `specty check --install` en tu terminal.");
    expect(await read(root, ".specty/config.yaml")).not.toContain("preCommit");
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("is the person's to run: without a terminal it only explains", async () => {
    const root = await typescript();
    const run = await cli(root, ["check", "--install"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      "Instalar las verificaciones lo decide la persona en su terminal: `specty check --install`. Para ver qué cambiaría, añade `--dry-run`.",
    );
  });

  it("applies what the person confirms, commits it, and has nothing left the second time", async () => {
    const root = await typescript();
    const terminal = person({ confirm: [true, true, false] });
    const run = await cli(root, ["check", "--install"], { terminal });
    expect(run.code).toBe(0);
    expect(terminal.notes[0]).toContain(".specty/config.yaml (modificar)");
    expect(terminal.notes[0]).toContain("+  preCommit: true");
    const config = await read(root, ".specty/config.yaml");
    expect(config).toContain("# Las verificaciones de este proyecto.");
    expect(config).toMatch(/preCommit: true/);
    const workflow = await read(root, WORKFLOW);
    expect(workflow).toContain("check --all --json");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(run.out).toContain(
      "Aplicado:\n  .specty/config.yaml\n  .github/workflows/specty-check.yml",
    );
    expect(run.out).toContain("Sin aplicar:\n  dependency-cruiser@18.7.0");
    expect(await read(root, "package.json")).not.toContain("dependency-cruiser");
    expect(git(root, "log", "-1", "--format=%B")).toContain("Specty-Init: true");
    expect(git(root, "status", "--porcelain")).toBe("");
    const again = await cli(root, ["check", "--install", "--dry-run"]);
    expect(again.out).not.toContain("(modificar)");
    expect(again.out).not.toContain("(crear)");
    expect(again.out).toContain("dependency-cruiser@18.7.0");
  });

  it("never overwrites what the person decided: it reports the conflict", async () => {
    const root = await typescript("checks:\n  levels: { secrets: off }\n  preCommit: false\n");
    await writeFiles(root, { [WORKFLOW]: "name: mine\n" });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "ci", "--no-verify");
    const run = await cli(root, ["check", "--install", "--dry-run"]);
    expect(run.out).toContain("Conflictos (no se tocan):");
    expect(run.out).toContain(
      "  .specty/config.yaml: `checks.preCommit` está en false; cámbialo tú si quieres las verificaciones en el pre-commit",
    );
    expect(run.out).toContain(`  ${WORKFLOW}: ya existe con otro contenido; no se pisa`);
    expect(run.out).toContain("No hay nada que instalar");
  });

  it("puts Dart's analyzer in strict mode, keeping its includes and comments", async () => {
    const root = await tempRepo({
      "pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n",
      "analysis_options.yaml":
        "# Opciones del equipo.\ninclude: package:flutter_lints/flutter.yaml\nanalyzer:\n  language:\n    strict-casts: false\n",
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n  preCommit: true\n`,
    });
    const terminal = person({ confirm: [true, true] });
    const run = await cli(root, ["check", "--install"], { terminal });
    expect(run.code).toBe(0);
    const options = await read(root, "analysis_options.yaml");
    expect(options).toContain("# Opciones del equipo.");
    expect(options).toContain("include: package:flutter_lints/flutter.yaml");
    expect(options).toContain("strict-casts: false");
    expect(options).toContain("strict-inference: true");
    expect(options).toContain("strict-raw-types: true");
    expect(run.out).toContain(
      "  analysis_options.yaml: strict-casts está en false en `analyzer.language`; cámbialo tú si quieres el modo estricto",
    );
    expect(await read(root, WORKFLOW)).toContain("subosito/flutter-action@v2");
  });

  it("creates analysis_options.yaml when there is none", async () => {
    const root = await tempRepo({
      "pubspec.yaml": "name: app\n",
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n  preCommit: true\n`,
    });
    const run = await cli(root, ["check", "--install", "--dry-run"]);
    expect(run.out).toContain("analysis_options.yaml (crear)");
    expect(run.out).toContain("+analyzer:\n+  language:\n+    strict-casts: true");
    expect(run.out).toContain("dart-lang/setup-dart@v1");
  });

  it("installs dependency-cruiser with the project's package manager once confirmed", async () => {
    const root = await typescript(
      'checks:\n  levels: { secrets: off }\n  preCommit: true\n  layers:\n    domain: { paths: ["src/domain/**"] }\n',
    );
    const bin = join(await mkdtemp(join(tmpdir(), "specty-npm-")), "bin");
    await mkdir(bin);
    await symlink(GIT, join(bin, "git"));
    await symlink(process.execPath, join(bin, "node"));
    await writeFile(
      join(bin, "npm"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const [name, version] = process.argv.at(-1).split("@");
manifest.devDependencies = { ...manifest.devDependencies, [name]: version };
fs.writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\\n");
`,
      { mode: 0o755 },
    );
    const terminal = person({ confirm: [true, true] });
    const run = await cli(root, ["check", "--install"], { terminal, env: { PATH: bin } });
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      "Aplicado:\n  .github/workflows/specty-check.yml\n  dependency-cruiser@18.7.0",
    );
    expect(JSON.parse(await read(root, "package.json")).devDependencies["dependency-cruiser"]).toBe(
      "18.7.0",
    );
    expect(git(root, "show", "--name-only", "--format=", "HEAD")).toContain("package.json");
  });

  it("says it in English", async () => {
    const root = await typescript();
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${LAYERED}`,
    });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "en", "--no-verify");
    const run = await cli(root, ["check", "--install", "--dry-run"]);
    expect(run.out).toContain(".specty/config.yaml (change)");
    expect(run.out).toContain("To apply it, run `specty check --install` in your terminal.");
  });
});
