// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, cli, git, tempRepo, writeFiles } from "./support";

const GIT = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();

/** The vulnerabilities the fake scanner knows, by `name@version`, each with its severity. */
const KNOWN: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  "lodash@4.17.19": [["GHSA-lodash-0001", "7.5"]],
  "lodash@4.17.20": [["GHSA-lodash-0001", "7.5"]],
  "minimist@0.0.8": [["GHSA-minimist-0002", "9.8"]],
  "serde@1.0.0": [["RUSTSEC-2026-0001", ""]],
};

type Flavor = "working" | "broken" | "failing";

interface ScannerRun {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly files: readonly string[];
  /** The text of each lockfile it was given, by its `-L` path. */
  readonly texts: Readonly<Record<string, string>>;
}

/**
 * An OSV-Scanner 2 that reads each `-L` lockfile as lines `name@version`, reports the known
 * vulnerabilities in its JSON form, leaves out the ids the `osv-scanner.toml` next to the
 * lockfile names, and logs how it was called. The broken one fails with 127, OSV-Scanner's
 * general error; the failing one with another code.
 */
const fakeScanner = (flavor: Flavor, log: string) => `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("osv-scanner version: 2.7.0"); process.exit(0); }
const locks = args.flatMap((arg, index) => (args[index - 1] === "-L" ? [arg] : []));
const files = fs.readdirSync(".", { recursive: true }).map(String).sort();
const texts = Object.fromEntries(locks.map((lock) => [lock, fs.readFileSync(lock, "utf8")]));
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd(), files, texts }) + "\\n");
const flavor = ${JSON.stringify(flavor)};
if (flavor === "broken") { console.error("failed to load config: invalid toml"); process.exit(127); }
if (flavor === "failing") { console.error("unknown flag: --frobnicate"); process.exit(2); }
if (args[0] !== "scan" || args[1] !== "source") process.exit(3);
if (!args.includes("--allow-no-lockfiles") || args[args.indexOf("--format") + 1] !== "json") process.exit(4);
const known = ${JSON.stringify(KNOWN)};
let found = false;
const results = locks.map((lock) => {
  const config = path.join(path.dirname(lock), "osv-scanner.toml");
  const ignored = fs.existsSync(config) ? fs.readFileSync(config, "utf8") : "";
  const packages = texts[lock].split("\\n").flatMap((line) => {
    const match = /^([^@\\s]+)@(\\S+)$/.exec(line.trim());
    if (match === null) return [];
    const vulns = (known[line.trim()] || []).filter(([id]) => !ignored.includes(id));
    if (vulns.length === 0) return [];
    found = true;
    return [{
      package: { name: match[1], version: match[2], ecosystem: "npm" },
      vulnerabilities: vulns.map(([id]) => ({ id, summary: "a known flaw" })),
      groups: vulns.map(([id, severity]) => ({ ids: [id], aliases: [id], max_severity: severity })),
    }];
  });
  return { source: { path: path.resolve(lock), type: "lockfile" }, packages };
});
fs.writeFileSync(args[args.indexOf("--output-file") + 1], JSON.stringify({ results, experimental_config: {} }));
process.exit(found ? 1 : 0);
`;

/** A PATH with only git, node and, unless `flavor` is undefined, the fake OSV-Scanner. */
async function scanner(flavor: Flavor | undefined) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-osv-")));
  const bin = join(folder, "bin");
  const log = join(folder, "runs.jsonl");
  await mkdir(bin);
  await symlink(GIT, join(bin, "git"));
  await symlink(process.execPath, join(bin, "node"));
  if (flavor !== undefined) {
    await writeFile(join(bin, "osv-scanner"), fakeScanner(flavor, log), { mode: 0o755 });
  }
  const runs = async (): Promise<ScannerRun[]> =>
    (await readFile(log, "utf8").catch(() => ""))
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  return { env: { PATH: bin }, runs };
}

/** `secrets` stays off: no other scanner of the machine runs, and none is missing either. */
const SETTINGS = "checks:\n  levels: { secrets: off }\n";

async function repo(files: Readonly<Record<string, string>> = {}): Promise<string> {
  return tempRepo({
    "src/app.ts": "export const a = 1;\n",
    "pnpm-lock.yaml": "minimist@0.0.8\nlodash@4.17.19\n",
    ".specty/config.yaml": `${CONFIG()}${SETTINGS}`,
    ...files,
  });
}

interface JsonCheck {
  readonly id: string;
  readonly status: string;
  readonly reason?: string;
  readonly findings: readonly { readonly path?: string; readonly message: string }[];
}

async function vulnerabilities(
  root: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<JsonCheck | undefined> {
  const run = await cli(root, ["--json", "check", ...args], { env });
  const checks: readonly JsonCheck[] = JSON.parse(run.out).checks;
  return checks.find((check) => check.id === "vulnerabilities");
}

describe("the vulnerabilities check of specty check", () => {
  it("AC1: fails with the vulnerabilities of the packages the change adds or upgrades, not the old ones", async () => {
    const root = await repo();
    await writeFiles(root, {
      "pnpm-lock.yaml": "minimist@0.0.8\nlodash@4.17.20\nleft-pad@1.3.0\n",
      "crates/Cargo.lock": "serde@1.0.0\n",
    });
    const { env, runs } = await scanner("working");
    const run = await cli(root, ["check"], { env });
    expect(run.code).toBe(1);
    expect(run.out).toContain("FALLA vulnerabilities");
    expect(run.out).toContain("  pnpm-lock.yaml lodash 4.17.20: GHSA-lodash-0001 (gravedad 7.5)");
    expect(run.out).toContain("  crates/Cargo.lock serde 1.0.0: RUSTSEC-2026-0001\n");
    expect(run.out).not.toContain("minimist");
    const check = await vulnerabilities(root, [], env);
    expect(check?.status).toBe("failed");
    expect(check?.findings.map((finding) => finding.path).toSorted()).toEqual([
      "crates/Cargo.lock",
      "pnpm-lock.yaml",
    ]);
    const scan = (await runs()).find((entry) => "crates/Cargo.lock" in entry.texts);
    expect(scan?.args.slice(0, 2)).toEqual(["scan", "source"]);
    expect(scan?.args).toContain("--allow-no-lockfiles");
    expect(Object.keys(scan?.texts ?? {}).toSorted()).toEqual([
      "crates/Cargo.lock",
      "pnpm-lock.yaml",
    ]);
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${SETTINGS}`,
    });
    expect((await cli(root, ["check"], { env })).out).toContain(
      "  pnpm-lock.yaml lodash 4.17.20: GHSA-lodash-0001 (severity 7.5)",
    );
  });

  it("AC2: names every known vulnerability of the lockfiles git tracks with --all", async () => {
    const root = await repo();
    const { env } = await scanner("working");
    const run = await cli(root, ["check", "--all"], { env });
    expect(run.code).toBe(1);
    expect(run.out).toContain("  pnpm-lock.yaml minimist 0.0.8: GHSA-minimist-0002 (gravedad 9.8)");
    expect(run.out).toContain("  pnpm-lock.yaml lodash 4.17.19: GHSA-lodash-0001 (gravedad 7.5)");
  });

  it("AC3: scans a copy of the lockfiles as the mode sees them, next to their osv-scanner.toml", async () => {
    const root = await repo({
      "web/pnpm-lock.yaml": "left-pad@1.3.0\n",
      "web/osv-scanner.toml":
        '[[IgnoredVulns]]\nid = "GHSA-lodash-0001"\nreason = "not reachable"\n',
    });
    await writeFiles(root, { "web/pnpm-lock.yaml": "lodash@4.17.20\nminimist@0.0.8\n" });
    const { env, runs } = await scanner("working");
    const check = await vulnerabilities(root, [], env);
    expect(check?.findings.map((finding) => finding.message)).toEqual([
      "minimist 0.0.8: GHSA-minimist-0002 (gravedad 9.8)",
    ]);
    const scan = (await runs()).find((entry) => entry.files.includes("web/pnpm-lock.yaml"));
    expect(scan?.files).toContain("web/osv-scanner.toml");
    expect(scan?.cwd.startsWith(`${root}/`)).toBe(false);
    expect(await exists(scan?.cwd ?? root)).toBe(false);

    // With --staged, the scanner reads what is staged, not what is on disk.
    const staged = await repo();
    await writeFiles(staged, { "pnpm-lock.yaml": "minimist@0.0.8\nserde@1.0.0\n" });
    git(staged, "add", "pnpm-lock.yaml");
    await writeFiles(staged, { "pnpm-lock.yaml": "minimist@0.0.8\nlodash@4.17.19\n" });
    const fresh = await scanner("working");
    const run = await cli(staged, ["check", "--staged"], { env: fresh.env });
    expect(run.code).toBe(1);
    expect(run.out).toContain("  pnpm-lock.yaml serde 1.0.0: RUSTSEC-2026-0001");
    const texts = (await fresh.runs()).map((entry) => entry.texts["pnpm-lock.yaml"]);
    expect(texts).toContain("minimist@0.0.8\nserde@1.0.0\n");
    expect(texts).not.toContain(undefined);
  });

  it("AC4: leaves the check out when the run touches no lockfile", async () => {
    const root = await repo();
    await writeFiles(root, { "src/app.ts": "export const a = 2;\n" });
    const { env, runs } = await scanner("working");
    expect(await vulnerabilities(root, [], env)).toBeUndefined();
    expect(await runs()).toEqual([]);
  });

  it("AC5: does not run without OSV-Scanner, and says to install it", async () => {
    const root = await repo();
    await writeFiles(root, { "pnpm-lock.yaml": "minimist@0.0.8\nlodash@4.17.20\n" });
    const { env } = await scanner(undefined);
    const run = await cli(root, ["check", "--verbose"], { env });
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      "SIN EJECUTAR vulnerabilities: OSV-Scanner no está en el PATH: instálalo para buscar las vulnerabilidades de las dependencias",
    );
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${SETTINGS}`,
    });
    expect(await vulnerabilities(root, [], env)).toMatchObject({
      status: "skipped",
      reason:
        "OSV-Scanner is not on PATH: install it to look for vulnerabilities in the dependencies",
    });
  });

  it("AC5: does not run when OSV-Scanner fails, and shows its last message", async () => {
    for (const [flavor, message] of [
      ["broken", "failed to load config: invalid toml"],
      ["failing", "unknown flag: --frobnicate"],
    ] as const) {
      const root = await repo();
      await writeFiles(root, { "pnpm-lock.yaml": "minimist@0.0.8\nlodash@4.17.20\n" });
      const { env } = await scanner(flavor);
      expect((await cli(root, ["check"], { env })).code).toBe(0);
      const check = await vulnerabilities(root, [], env);
      expect(check?.status).toBe("skipped");
      expect(check?.reason).toContain(message);
    }
  });
});
