// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";

/** The change adds lines 2 to 6; line 5 is a brace no tool measures. */
const CHANGED = [
  "export const a = 1;",
  "export function f(x: number) {",
  "  if (x > 0) return 1;",
  "  return 2;",
  "}",
  "export const b = 3;",
  "",
].join("\n");

/** What the tests leave in `coverage/lcov.info`: of lines 2, 3, 4 and 6, line 4 never ran. */
const LCOV = [
  "SF:src/app.ts",
  "DA:1,1",
  "DA:2,1",
  "DA:3,1",
  "DA:4,0",
  "DA:6,1",
  "end_of_record",
  "",
].join("\n");

/** A test script that writes `report` to `coverage/lcov.info`, or nothing without one. */
const testScript = (report?: string) =>
  report === undefined
    ? "process.exit(0);\n"
    : [
        'const fs = require("node:fs");',
        'fs.mkdirSync("coverage", { recursive: true });',
        `fs.writeFileSync("coverage/lcov.info", ${JSON.stringify(report)});`,
        "",
      ].join("\n");

async function repo(report: string | undefined, config = CHECKS): Promise<string> {
  const root = await tempRepo({
    "package.json": `${JSON.stringify({ name: "app", scripts: { test: "node tools/test.js" } })}\n`,
    "tools/test.js": testScript(report),
    "src/app.ts": "export const a = 1;\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
  });
  await writeFiles(root, { "src/app.ts": CHANGED });
  return root;
}

interface JsonCheck {
  readonly id: string;
  readonly status: string;
  readonly findings: readonly { readonly path?: string; readonly line?: number }[];
}

async function checks(root: string): Promise<readonly JsonCheck[]> {
  return JSON.parse((await cli(root, ["--json", "check"])).out).checks;
}

describe("the coverage of the lines a change adds", () => {
  it("AC1: after the tests, says what part of the added lines ran and where the gaps are", async () => {
    const root = await repo(LCOV);
    const run = await cli(root, ["check"]);
    expect(run.out).toContain("AVISO diff-coverage");
    expect(run.out).toContain("75 %");
    expect(run.out).toContain("src/app.ts:4");
    expect(run.out).not.toContain("src/app.ts:5");
    const coverage = (await checks(root)).find((check) => check.id === "diff-coverage");
    expect(coverage?.findings.filter((finding) => finding.path !== undefined)).toEqual([
      expect.objectContaining({ path: "src/app.ts", line: 4 }),
    ]);
  });

  it("AC3: warns below checks.coverage.warn, fails below checks.coverage.error, passes above", async () => {
    const warned = await cli(await repo(LCOV), ["check"]);
    expect(warned.code).toBe(0);
    expect(warned.out).toContain("AVISO diff-coverage");
    const failing = await repo(LCOV, `${CHECKS}  coverage: { error: 80 }\n`);
    const failed = await cli(failing, ["check"]);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("FALLA diff-coverage");
    const lenient = await repo(LCOV, `${CHECKS}  coverage: { warn: 70 }\n`);
    const passed = await cli(lenient, ["check"]);
    expect(passed.out).not.toContain("diff-coverage");
    expect((await checks(lenient)).find((check) => check.id === "diff-coverage")).toMatchObject({
      status: "passed",
      findings: [],
    });
  });

  it("AC4: leaves the check out without a fresh report or without measured added lines", async () => {
    const ids = async (root: string) => (await checks(root)).map((check) => check.id);
    // The tests write no report.
    expect(await ids(await repo(undefined))).not.toContain("diff-coverage");
    // A report from before the run, which the tests did not rewrite.
    const stale = await repo(undefined);
    await writeFiles(stale, { "coverage/lcov.info": LCOV });
    expect(await ids(stale)).not.toContain("diff-coverage");
    // The tests did not run in this run, as in `task done` with its own verification.
    const skipped = await repo(LCOV, "checks:\n  levels: { secrets: off, tests: off }\n");
    expect(await ids(skipped)).not.toContain("diff-coverage");
    // The report measures none of the lines the change adds.
    const elsewhere = await repo(["SF:src/other.ts", "DA:1,0", "end_of_record", ""].join("\n"));
    expect(await ids(elsewhere)).not.toContain("diff-coverage");
  });
});
