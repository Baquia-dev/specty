// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, cli, git, tempRepo, writeFiles } from "./support";

const GIT = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();

/** `secrets` stays off, so that no scanner on the machine runs. */
const SETTINGS = `${CONFIG()}checks:\n  levels: { secrets: off }\n`;

type Flavor = "opengrep" | "semgrep" | "broken";

interface ScannerRun {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** The folder it scans: its last argument. */
  readonly target: string;
  readonly files: readonly string[];
}

/**
 * A scanner that reads the rules of each `--config` (a file or a folder of them) in a minimal
 * form, finds each rule's literal text in the files of the folder it scans (a match goes from its
 * line to the first one with `)`), skips the paths of its `.semgrepignore`, prefixes the rule ids
 * with their file's folders as Opengrep does, and logs how it was called. Opengrep rejects
 * `--metrics`; Semgrep runs only with `--metrics=off`.
 */
const fakeScanner = (program: string, flavor: Flavor, log: string) => `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const target = args.at(-1);
const files = fs.existsSync(target) ? fs.readdirSync(target, { recursive: true }).map(String).sort() : [];
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ program: ${JSON.stringify(program)}, args, cwd: process.cwd(), target, files }) + "\\n");
const flavor = ${JSON.stringify(flavor)};
if (flavor === "broken") { console.error("[ERROR] invalid rule no-eval: missing pattern"); process.exit(7); }
if (args[0] !== "scan" || !args.includes("--json")) process.exit(2);
if (flavor === "opengrep" && args.some((arg) => arg.startsWith("--metrics"))) { console.error("unknown option '--metrics'"); process.exit(2); }
if (flavor === "semgrep" && !args.includes("--metrics=off")) { console.error("metrics are on"); process.exit(2); }
const configs = args.flatMap((arg, index) => (args[index - 1] === "--config" ? [arg] : []));
const ruleFiles = configs.flatMap((config) =>
  fs.statSync(config).isDirectory()
    ? fs.readdirSync(config, { recursive: true }).map(String).filter((file) => /\\.ya?ml$/.test(file)).sort().map((file) => path.join(config, file))
    : [config]);
const prefixOf = (file) => {
  const relative = file.startsWith(process.cwd() + "/") ? file.slice(process.cwd().length + 1) : file;
  const dirs = relative.split("/").slice(0, -1).join(".").replace(/^[./]+/, "");
  return dirs === "" ? "" : dirs + ".";
};
const rules = ruleFiles.flatMap((file) =>
  fs.readFileSync(file, "utf8").split(/^\\s*- id:/m).slice(1).map((block) => {
    const field = (name) => (block.match(new RegExp("^\\\\s*" + name + ":\\\\s*(.*)$", "m")) ?? [])[1]?.trim() ?? "";
    return { id: prefixOf(file) + block.split("\\n")[0].trim(), pattern: field("pattern").replace(/\\.\\.\\.\\)$/, ""), message: field("message"), severity: field("severity") };
  }));
const ignoreFile = path.join(target, ".semgrepignore");
const ignored = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8").split("\\n").filter(Boolean) : [];
const results = files
  .filter((file) => file !== ".semgrepignore" && fs.statSync(path.join(target, file)).isFile())
  .filter((file) => !ignored.some((ignore) => file.startsWith(ignore)))
  .flatMap((file) => {
    const lines = fs.readFileSync(path.join(target, file), "utf8").split("\\n");
    return lines.flatMap((text, index) => rules.filter((rule) => text.includes(rule.pattern)).map((rule) => {
      const close = lines.findIndex((other, at) => at >= index && other.includes(")"));
      return {
        check_id: rule.id,
        path: path.join(target, file),
        start: { line: index + 1, col: 1, offset: 0 },
        end: { line: (close === -1 ? index : close) + 1, col: 1, offset: 0 },
        extra: { message: rule.message + "\\nSee the rule.", severity: rule.severity, lines: "requires login" },
      };
    }));
  });
fs.writeFileSync(args[args.indexOf("--output") + 1], JSON.stringify({ version: "1.33.1", results, errors: [], paths: { scanned: [] } }));
`;

/** A PATH with only git, node and these fake scanners, and the log of their runs. */
async function scanners(kinds: Partial<Record<"opengrep" | "semgrep", Flavor>>) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-rules-")));
  const bin = join(folder, "bin");
  const log = join(folder, "runs.jsonl");
  await mkdir(bin);
  await symlink(GIT, join(bin, "git"));
  await symlink(process.execPath, join(bin, "node"));
  for (const [name, flavor] of Object.entries(kinds)) {
    await writeFile(join(bin, name), fakeScanner(name, flavor, log), { mode: 0o755 });
  }
  const runs = async (): Promise<ScannerRun[]> =>
    (await readFile(log, "utf8").catch(() => ""))
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  /** The run at `index` of the log, from the end when negative. */
  const scan = async (index: number): Promise<ScannerRun> => {
    const found = (await runs()).at(index);
    if (found === undefined) throw new Error(`no scanner run ${index}`);
    return found;
  };
  return { env: { PATH: bin }, runs, scan };
}

/** A rule in the form the fake scanners read: the text of `pattern` before `...)`, literally. */
const rule = (id: string, call: string, message: string, severity = "ERROR") =>
  `  - id: ${id}\n    pattern: ${call}(...)\n    message: ${message}\n    languages: [typescript]\n    severity: ${severity}\n`;

const rules = (...list: string[]) => `rules:\n${list.join("")}`;

const NO_EVAL = rules(rule("no-eval", "eval", "no uses eval"));

async function repo(files: Readonly<Record<string, string>> = {}): Promise<string> {
  return tempRepo({
    "src/app.ts": "export const a = 1;\n",
    ".specty/config.yaml": SETTINGS,
    ...files,
  });
}

const failure = (...lines: string[]) =>
  ["FALLA code-rules", ...lines, "OK 4/5 · FALLA: code-rules"].join("\n");

describe("the code-rules check of specty check", () => {
  it("AC1: fails on the matches that touch added lines, and on all of them with --all", async () => {
    const root = await repo({
      ".semgrep.yml": NO_EVAL,
      "src/app.ts": 'eval("old");\nexport const a = 1;\neval(\n  "x",\n);\n',
    });
    await writeFiles(root, {
      "src/app.ts": 'eval("old");\nexport const a = 1;\neval(\n  "y",\n);\neval("new");\n',
      "src/new.ts": 'eval("other");\n',
    });
    const { env } = await scanners({ opengrep: "opengrep" });
    expect(await cli(root, ["check"], { env })).toMatchObject({
      code: 1,
      out: failure(
        "  src/app.ts:3 no-eval: no uses eval",
        "  src/app.ts:6 no-eval: no uses eval",
        "  src/new.ts:1 no-eval: no uses eval",
      ),
    });
    git(root, "add", "-A");
    expect(await cli(root, ["check", "--all"], { env })).toMatchObject({
      code: 1,
      out: failure(
        "  src/app.ts:1 no-eval: no uses eval",
        "  src/app.ts:3 no-eval: no uses eval",
        "  src/app.ts:6 no-eval: no uses eval",
        "  src/new.ts:1 no-eval: no uses eval",
      ),
    });
  });

  it("AC2: fails only on the matches of ERROR, CRITICAL and HIGH rules; the others warn", async () => {
    const severities = ["ERROR", "CRITICAL", "HIGH", "WARNING", "INFO", "MEDIUM", "LOW"];
    const root = await repo({
      ".semgrep/rules.yml": rules(
        ...severities.map((severity) =>
          rule(
            `rule-${severity.toLowerCase()}`,
            `call${severity}`,
            `una regla ${severity}`,
            severity,
          ),
        ),
      ),
    });
    await writeFiles(root, { "src/app.ts": "export const a = 1;\ncallWARNING();\ncallINFO();\n" });
    const { env } = await scanners({ opengrep: "opengrep" });
    expect(await cli(root, ["check"], { env })).toMatchObject({
      code: 0,
      out: [
        "AVISO code-rules",
        "  src/app.ts:2 semgrep.rule-warning: una regla WARNING",
        "  src/app.ts:3 semgrep.rule-info: una regla INFO",
        "OK 4/5 · AVISO: code-rules",
      ].join("\n"),
    });
    await writeFiles(root, {
      "src/app.ts": severities.map((severity) => `call${severity}();\n`).join(""),
    });
    const run = await cli(root, ["check", "--json"], { env });
    expect(run.code).toBe(1);
    const report: { checks: { id: string; status: string; findings: unknown[] }[] } = JSON.parse(
      run.out,
    );
    const check = report.checks.find((each) => each.id === "code-rules");
    expect(check?.status).toBe("failed");
    expect(check?.findings).toEqual(
      severities.map((severity, index) => ({
        path: "src/app.ts",
        line: index + 1,
        message: `semgrep.rule-${severity.toLowerCase()}: una regla ${severity}`,
        ...(index < 3 ? {} : { severity: "warning" }),
      })),
    );
  });

  it("AC3: runs from the root with the project's rules, on a copy of the run's files", async () => {
    const root = await repo({
      ".opengrep.yml": rules(rule("no-exec", "exec", "no uses exec")),
      ".semgrep.yml": NO_EVAL,
      ".semgrepignore": "legacy/\n",
    });
    await writeFiles(root, {
      ".semgrep.yml": rules(
        rule("no-eval", "eval", "no uses eval"),
        rule("no-exec-sync", "execSync", "no uses execSync"),
      ),
      "src/app.ts": 'export const a = 1;\neval("a");\n',
      "legacy/old.ts": 'eval("b");\n',
    });
    const { env, scan } = await scanners({ opengrep: "opengrep", semgrep: "semgrep" });
    expect((await cli(root, ["check"], { env })).out).toBe(
      failure("  src/app.ts:2 no-eval: no uses eval"),
    );
    const run = await scan(-1);
    const output = run.args[run.args.indexOf("--output") + 1] ?? "";
    expect(run.program).toBe("opengrep");
    expect(run.cwd).toBe(root);
    expect(run.args).toEqual([
      "scan",
      "--config",
      ".opengrep.yml",
      "--config",
      ".semgrep.yml",
      "--json",
      "--output",
      output,
      "--disable-version-check",
      run.target,
    ]);
    expect(run.files).toEqual([".semgrepignore", "legacy", "legacy/old.ts", "src", "src/app.ts"]);
    expect(run.target.startsWith(root)).toBe(false);
    expect(output.startsWith(run.target)).toBe(false);
    expect(await exists(run.target)).toBe(false);

    git(root, "add", "src/app.ts");
    await writeFiles(root, { "src/app.ts": "export const a = 1;\n" });
    expect((await cli(root, ["check", "--staged"], { env })).out).toBe(
      failure("  src/app.ts:2 no-eval: no uses eval"),
    );
    expect((await scan(-1)).files).toEqual([".semgrepignore", "src", "src/app.ts"]);
    expect((await cli(root, ["check"], { env })).code).toBe(0);
  });

  it("AC3: falls back to Semgrep, with its metrics off", async () => {
    const root = await repo({ ".semgrep.yml": NO_EVAL });
    await writeFiles(root, { "src/app.ts": 'eval("a");\n' });
    const { env, scan } = await scanners({ semgrep: "semgrep" });
    expect((await cli(root, ["check"], { env })).out).toBe(
      failure("  src/app.ts:1 no-eval: no uses eval"),
    );
    const run = await scan(-1);
    expect(run.program).toBe("semgrep");
    expect(run.cwd).toBe(root);
    expect(run.args.slice(0, 3)).toEqual(["scan", "--config", ".semgrep.yml"]);
    expect(run.args).toContain("--metrics=off");
  });

  it("AC4: does not show without rules at the root", async () => {
    const root = await repo({ "tools/.semgrep.yml": NO_EVAL });
    await writeFiles(root, { "src/app.ts": 'eval("a");\n' });
    const { env, runs } = await scanners({ opengrep: "opengrep" });
    expect(await cli(root, ["check"], { env })).toMatchObject({ code: 0, out: "OK 4/4" });
    expect(await runs()).toEqual([]);
  });

  it("AC5: does not run without Opengrep or Semgrep, and says what to install", async () => {
    const root = await repo({ ".semgrep.yml": NO_EVAL });
    await writeFiles(root, { "src/app.ts": 'eval("a");\n' });
    const { env } = await scanners({});
    expect(await cli(root, ["check"], { env })).toMatchObject({
      code: 0,
      out: "OK 4/5 · SIN EJECUTAR: code-rules",
    });
    expect((await cli(root, ["check", "--verbose"], { env })).out).toContain(
      "SIN EJECUTAR code-rules: Opengrep y Semgrep no están en el PATH: instala Opengrep (o Semgrep) para aplicar las reglas del proyecto",
    );
    await writeFiles(root, {
      ".specty/config.yaml": SETTINGS.replace("language: es", "language: en"),
    });
    expect((await cli(root, ["check", "--verbose"], { env })).out).toContain(
      "NOT RUN code-rules: Neither Opengrep nor Semgrep is on PATH: install Opengrep (or Semgrep) to apply the project's rules",
    );
  });

  it("AC5: does not run when the scanner fails, and shows its error", async () => {
    const root = await repo({ ".semgrep.yml": NO_EVAL });
    await writeFiles(root, { "src/app.ts": 'eval("a");\n' });
    const { env, runs } = await scanners({ opengrep: "broken", semgrep: "semgrep" });
    const run = await cli(root, ["check", "--verbose"], { env });
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      "SIN EJECUTAR code-rules: opengrep: [ERROR] invalid rule no-eval: missing pattern",
    );
    expect((await runs()).map((each) => each.program)).toEqual(["opengrep"]);
  });
});
