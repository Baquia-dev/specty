// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, cli, git, tempRepo, writeFiles } from "./support";

/** What the fake scanners report: no real scanner takes it for a secret. */
const SECRET = "FAKE-SECRET-";
const GIT = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();

type Flavor = "betterleaks-2" | "betterleaks-1" | "gitleaks" | "broken";

interface ScannerRun {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly files: readonly string[];
}

/**
 * A scanner that reports each line with `SECRET` as `fake-token`, in the form of `flavor`, and
 * logs how it was called. Betterleaks 1 rejects `fs`; gitleaks honours `.gitleaksignore`.
 */
const fakeScanner = (flavor: Flavor, log: string) => `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const files = fs.readdirSync(".", { recursive: true }).map(String).sort();
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd(), files }) + "\\n");
const flavor = ${JSON.stringify(flavor)};
if (flavor === "broken") { console.error("config: invalid regex"); process.exit(2); }
const v2 = args[0] === "--no-banner" && args[1] === "fs";
if (v2 && flavor !== "betterleaks-2") { console.error('Error: unknown command "fs"'); process.exit(1); }
if (!v2 && args[0] !== "dir") process.exit(3);
if (!args.includes("--redact")) process.exit(4);
const ignored = fs.existsSync(".gitleaksignore") ? fs.readFileSync(".gitleaksignore", "utf8").split("\\n") : [];
const leaks = files.filter((file) => fs.statSync(file).isFile()).flatMap((file) =>
  fs.readFileSync(file, "utf8").split("\\n").flatMap((text, index) =>
    text.includes(${JSON.stringify(SECRET)}) && !ignored.includes(file + ":fake-token:" + (index + 1))
      ? [{ file, line: index + 1 }]
      : []));
const report = args[args.indexOf(v2 ? "--output" : "--report-path") + 1];
const body = v2
  ? { schema_version: "1", scan: {}, findings: leaks.map((leak) => ({ rule_id: "fake-token", location: { path: "./" + leak.file, start_line: leak.line }, match: { value: "REDACTED" } })) }
  : leaks.map((leak) => ({ RuleID: "fake-token", File: path.resolve(leak.file), StartLine: leak.line, Secret: "REDACTED" }));
fs.writeFileSync(report, JSON.stringify(body));
`;

/** A PATH with only git, node and these fake scanners, and the log of their runs. */
async function scanners(kinds: Partial<Record<"betterleaks" | "gitleaks", Flavor>>) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-scanners-")));
  const bin = join(folder, "bin");
  const log = join(folder, "runs.jsonl");
  await mkdir(bin);
  await symlink(GIT, join(bin, "git"));
  await symlink(process.execPath, join(bin, "node"));
  for (const [name, flavor] of Object.entries(kinds)) {
    await writeFile(join(bin, name), fakeScanner(flavor, log), { mode: 0o755 });
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
  return { env: { PATH: bin, BETTERLEAKS_CONFIG: "", BETTERLEAKS_CONFIG_TOML: "" }, scan };
}

async function repo(files: Readonly<Record<string, string>> = {}): Promise<string> {
  return tempRepo({
    "src/app.ts": "export const a = 1;\n",
    ".specty/config.yaml": CONFIG(),
    ...files,
  });
}

const failure = (...lines: string[]) =>
  ["FALLA secrets", ...lines, "OK 4/5 · FALLA: secrets"].join("\n");

describe("the secrets check of specty check", () => {
  it("asks Betterleaks for the secrets of the added lines, redacted, on a copy", async () => {
    const root = await repo({ "src/config.ts": `export const one = "${SECRET}one";\n` });
    await writeFiles(root, {
      "src/config.ts": `export const one = "${SECRET}one";\nexport const b = 2;\nexport const two = "${SECRET}two";\n`,
    });
    const { env, scan } = await scanners({ betterleaks: "betterleaks-2", gitleaks: "gitleaks" });
    const run = await cli(root, ["check"], { env });
    expect(run).toMatchObject({
      code: 1,
      out: failure("  src/config.ts:3 posible secreto: fake-token"),
    });
    const first = await scan(0);
    expect(first.args).toEqual([
      "--no-banner",
      "fs",
      ".",
      "--redact",
      "--output",
      expect.stringMatching(/report\.json$/),
      "--exit-code",
      "0",
    ]);
    expect(first.files).toEqual(["src", "src/config.ts"]);
    expect(first.args[5]?.startsWith(first.cwd)).toBe(false);
    expect(await exists(first.cwd)).toBe(false);
    const all = await cli(root, ["check", "--all"], { env });
    expect(all.out).toContain("  src/config.ts:1 posible secreto: fake-token");
    expect(all.out).toContain("  src/config.ts:3 posible secreto: fake-token");
  });

  it("speaks the gitleaks form to gitleaks and to Betterleaks 1, with their files", async () => {
    for (const kinds of [{ gitleaks: "gitleaks" }, { betterleaks: "betterleaks-1" }] as const) {
      const root = await repo({
        ".gitleaks.toml": 'title = "repo"\n',
        ".gitleaksignore": "src/known.ts:fake-token:1\n",
      });
      await writeFiles(root, {
        "src/config.ts": `export const two = "${SECRET}two";\n`,
        "src/known.ts": `export const known = "${SECRET}known";\n`,
      });
      const { env, scan } = await scanners(kinds);
      const run = await cli(root, ["check"], { env });
      expect(run.out).toBe(failure("  src/config.ts:1 posible secreto: fake-token"));
      const last = await scan(-1);
      expect(last.args.slice(0, 6)).toEqual([
        "dir",
        ".",
        "--report-format",
        "json",
        "--report-path",
        expect.stringMatching(/report\.json$/),
      ]);
      expect(last.files).toEqual(expect.arrayContaining([".gitleaks.toml", ".gitleaksignore"]));
    }
  });

  it("gives Betterleaks the configuration of the repository unless the environment has one", async () => {
    const root = await repo({ ".betterleaks.toml": 'title = "repo"\n', ".betterleaksignore": "" });
    await writeFiles(root, { "src/config.ts": `export const two = "${SECRET}two";\n` });
    const { env, scan } = await scanners({ betterleaks: "betterleaks-2" });
    await cli(root, ["check"], { env });
    await cli(root, ["check"], { env: { ...env, BETTERLEAKS_CONFIG: "/etc/leaks.toml" } });
    const repository = await scan(0);
    expect(repository.args.slice(-2)).toEqual(["--config", join(root, ".betterleaks.toml")]);
    expect(repository.files).toContain(".betterleaksignore");
    expect((await scan(1)).args).not.toContain("--config");
  });

  it("does not run without a scanner, and says what to install", async () => {
    const root = await repo();
    await writeFiles(root, { "src/config.ts": `export const two = "${SECRET}two";\n` });
    const { env } = await scanners({});
    expect(await cli(root, ["check"], { env })).toMatchObject({
      code: 0,
      out: "OK 4/5 · SIN EJECUTAR: secrets",
    });
    expect((await cli(root, ["check", "--verbose"], { env })).out).toContain(
      "SIN EJECUTAR secrets: Betterleaks y gitleaks no están en el PATH: instala Betterleaks (o gitleaks) para buscar secretos",
    );
    await writeFiles(root, {
      ".specty/config.yaml": CONFIG().replace("language: es", "language: en"),
    });
    expect((await cli(root, ["check", "--verbose"], { env })).out).toContain(
      "NOT RUN secrets: Neither Betterleaks nor gitleaks is on PATH: install Betterleaks (or gitleaks) to look for secrets",
    );
  });

  it("does not run when the scanner fails, and shows its error", async () => {
    const root = await repo();
    await writeFiles(root, { "src/config.ts": `export const two = "${SECRET}two";\n` });
    const { env } = await scanners({ betterleaks: "broken" });
    const run = await cli(root, ["check", "--verbose"], { env });
    expect(run.code).toBe(0);
    expect(run.out).toContain("SIN EJECUTAR secrets: betterleaks: config: invalid regex");
  });

  it("scans what is staged with --staged, in English too", async () => {
    const root = await repo();
    await writeFiles(root, {
      ".specty/config.yaml": CONFIG().replace("language: es", "language: en"),
      "src/app.ts": `export const a = 1;\nexport const two = "${SECRET}two";\n`,
    });
    git(root, "add", "src/app.ts");
    await writeFiles(root, { "src/app.ts": "export const a = 1;\n" });
    const { env } = await scanners({ betterleaks: "betterleaks-2" });
    const staged = await cli(root, ["check", "--staged"], { env });
    expect(staged.code).toBe(1);
    expect(staged.out).toContain("  src/app.ts:2 possible secret: fake-token");
    expect((await cli(root, ["check"], { env })).code).toBe(0);
  });
});
