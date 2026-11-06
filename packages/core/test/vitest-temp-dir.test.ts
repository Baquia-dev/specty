// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import setup from "../vitest-temp-dir";

const RUN = /^specty-tests-\d+-/;
const KEYS = ["TMPDIR", "TMP", "TEMP"] as const;
const CACHE = "SPECTY_TESTS_CACHE";
const saved = [...KEYS, CACHE].map((key) => [key, process.env[key]] as const);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

/** A folder of its own that plays the system's temporary folder for the setup. */
function systemFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "system-"));
  for (const key of KEYS) process.env[key] = folder;
  return folder;
}

function runs(folder: string): string[] {
  return readdirSync(folder).filter((name) => RUN.test(name));
}

/** The pid of a process that already ended. */
function ended(): number {
  const child = spawnSync(process.execPath, ["-e", ""]);
  if (child.pid === undefined) throw new Error("no child process");
  return child.pid;
}

describe("vitest-temp-dir", () => {
  it("AC1: core's tests and the processes they start use a folder of the run", () => {
    expect(basename(tmpdir())).toMatch(RUN);
    const child = execFileSync(process.execPath, ["-p", "require('node:os').tmpdir()"], {
      encoding: "utf8",
    });
    expect(child.trim()).toBe(tmpdir());
  });

  it("AC1: points the temporary folder at a new folder of the run and removes it at the end", () => {
    const system = systemFolder();
    const teardown = setup();
    const folder = tmpdir();
    expect(dirname(folder)).toBe(system);
    expect(basename(folder)).toMatch(new RegExp(`^specty-tests-${process.pid}-`));
    for (const key of KEYS) expect(process.env[key]).toBe(folder);
    mkdirSync(join(folder, "specty-repo"));
    writeFileSync(join(folder, "specty-repo", "a.txt"), "a\n");
    teardown();
    expect(existsSync(folder)).toBe(false);
    for (const key of KEYS) expect(process.env[key]).toBe(system);
  });

  it("AC1: removes the folder of the run when a test fails", () => {
    const system = mkdtempSync(join(tmpdir(), "system-"));
    const project = mkdtempSync(join(tmpdir(), "project-"));
    const helper = join(import.meta.dirname, "..", "vitest-temp-dir.ts");
    writeFileSync(
      join(project, "vitest.config.mjs"),
      `export default { test: { globals: true, include: ["fails.test.mjs"], globalSetup: [${JSON.stringify(helper)}] } };\n`,
    );
    writeFileSync(
      join(project, "fails.test.mjs"),
      [
        'import { writeFileSync } from "node:fs";',
        'import { tmpdir } from "node:os";',
        'import { join } from "node:path";',
        'test("leaves a file and fails", () => {',
        '  writeFileSync(join(tmpdir(), "left.txt"), "x");',
        '  throw new Error("folder: " + tmpdir());',
        "});",
        "",
      ].join("\n"),
    );
    const vitest = createRequire(import.meta.url).resolve("vitest/package.json");
    const run = spawnSync(process.execPath, [join(dirname(vitest), "vitest.mjs"), "run"], {
      cwd: project,
      env: { ...process.env, TMPDIR: system, TMP: system, TEMP: system },
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain(`folder: ${join(system, "specty-tests-")}`);
    expect(runs(system)).toEqual([]);
  }, 60_000);

  it("leaves a shared folder for caches, outside the run's, which outlives it", () => {
    const system = systemFolder();
    Reflect.deleteProperty(process.env, CACHE);
    const teardown = setup();
    const cache = join(system, "specty-tests-cache");
    expect(process.env[CACHE]).toBe(cache);
    mkdirSync(join(cache, "opencode"), { recursive: true });
    writeFileSync(join(cache, "opencode", "provider.js"), "x\n");
    teardown();
    expect(process.env[CACHE]).toBeUndefined();
    const next = setup();
    expect(existsSync(join(cache, "opencode", "provider.js"))).toBe(true);
    next();
    expect(existsSync(join(cache, "opencode", "provider.js"))).toBe(true);
  });

  it("keeps the cache folder already set, as a run its tests start inherits it", () => {
    const system = systemFolder();
    const mine = join(system, "mine");
    process.env[CACHE] = mine;
    const teardown = setup();
    expect(process.env[CACHE]).toBe(mine);
    teardown();
    expect(process.env[CACHE]).toBe(mine);
    expect(existsSync(mine)).toBe(false);
  });

  it("AC2: removes the folders of runs whose process ended and leaves the rest", () => {
    const system = systemFolder();
    const dead = `specty-tests-${ended()}-AbC123`;
    const alive = `specty-tests-${process.pid}-DeF456`;
    mkdirSync(join(system, dead, "specty-repo"), { recursive: true });
    writeFileSync(join(system, dead, "specty-repo", "a.txt"), "a\n");
    mkdirSync(join(system, alive));
    mkdirSync(join(system, "specty-XyZ789"));
    writeFileSync(join(system, "specty-tests-notes.txt"), "x\n");
    const teardown = setup();
    const folder = basename(tmpdir());
    expect(existsSync(join(system, dead))).toBe(false);
    expect(readdirSync(system).sort()).toEqual(
      [alive, folder, "specty-XyZ789", "specty-tests-notes.txt"].sort(),
    );
    teardown();
    expect(readdirSync(system).sort()).toEqual(
      [alive, "specty-XyZ789", "specty-tests-notes.txt"].sort(),
    );
  });
});
