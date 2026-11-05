// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";
/** Where the tests below leave their reports, and a second as the limit. */
const TEST_TIME = '  testTime: { reports: ["reports/*.xml", "*/*/reports/*.xml"], maxMs: 1000 }\n';

/** A report as Vitest writes it: two tests over a second, one under. */
const junit = (file: string, times: readonly [number, number, number] = [1.5, 2.6, 0.004]) =>
  [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<testsuites name="vitest tests" tests="3" failures="0" errors="0" time="4.1">',
    `  <testsuite name="${file}" tests="3" failures="0" errors="0" skipped="0" time="4.1">`,
    `    <testcase classname="${file}" name="sum &gt; adds big numbers" time="${times[0]}"></testcase>`,
    `    <testcase classname="${file}" name="sum &gt; adds many numbers" time="${times[1]}"></testcase>`,
    `    <testcase classname="${file}" name="sum &gt; adds two numbers" time="${times[2]}"></testcase>`,
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n");

/** A test script that writes `report` to `path`, or nothing without one. */
const testScript = (report: string | undefined, path: string) =>
  report === undefined
    ? "process.exit(0);\n"
    : [
        'const fs = require("node:fs");',
        `fs.mkdirSync(${JSON.stringify(path.slice(0, path.lastIndexOf("/")))}, { recursive: true });`,
        `fs.writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(report)});`,
        "",
      ].join("\n");

/** A repository whose tests leave `report` at `path`, with a change to `src/app.ts`. */
async function repo(
  report: string | undefined,
  config = `${CHECKS}${TEST_TIME}`,
  path = "reports/junit.xml",
): Promise<string> {
  const root = await tempRepo({
    "package.json": `${JSON.stringify({ name: "app", scripts: { test: "node tools/test.js" } })}\n`,
    "tools/test.js": testScript(report, path),
    "src/app.ts": "export const a = 1;\n",
    "test/sum.test.ts": "// the tests of sum\n",
    "packages/web/test/sum.test.ts": "// the tests of sum in a package\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
  });
  await writeFiles(root, { "src/app.ts": "export const a = 2;\n" });
  return root;
}

interface JsonCheck {
  readonly id: string;
  readonly status: string;
  readonly findings: readonly {
    readonly path?: string;
    readonly message: string;
    readonly severity?: string;
  }[];
}

async function testTime(root: string): Promise<JsonCheck | undefined> {
  const report: { checks: JsonCheck[] } = JSON.parse((await cli(root, ["--json", "check"])).out);
  return report.checks.find((check) => check.id === "test-time");
}

describe("the tests that take longer than checks.testTime.maxMs", () => {
  it("AC1: after the tests, warns of each slow one, the longest first, without failing the run", async () => {
    const root = await repo(junit("test/sum.test.ts"));
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      [
        "AVISO test-time",
        "  test/sum.test.ts «sum > adds many numbers» tarda 2,6 s (más de 1 s)",
        "  test/sum.test.ts «sum > adds big numbers» tarda 1,5 s (más de 1 s)",
      ].join("\n"),
    );
    expect(run.out).not.toContain("adds two numbers");
    const check = await testTime(root);
    expect(check?.status).toBe("warned");
    expect(check?.findings).toEqual([
      expect.objectContaining({ path: "test/sum.test.ts", severity: "warning" }),
      expect.objectContaining({ path: "test/sum.test.ts", severity: "warning" }),
    ]);
  });

  it("AC2: a file relative to its package's folder comes with its path from the root", async () => {
    const root = await repo(
      junit("test/sum.test.ts"),
      `${CHECKS}${TEST_TIME}`,
      "packages/web/reports/junit.xml",
    );
    const check = await testTime(root);
    expect(check?.findings.map((finding) => finding.path)).toEqual([
      "packages/web/test/sum.test.ts",
      "packages/web/test/sum.test.ts",
    ]);
  });

  it("AC3: with fresh reports and no slow test, the check passes", async () => {
    const root = await repo(junit("test/sum.test.ts", [0.2, 0.3, 0.004]));
    expect(await testTime(root)).toMatchObject({ status: "passed", findings: [] });
    expect((await cli(root, ["check"])).out).not.toContain("test-time");
  });

  it("AC3: leaves the check out without checks.testTime or without a report the run wrote", async () => {
    // No `checks.testTime`, although the tests leave a report.
    expect(await testTime(await repo(junit("test/sum.test.ts"), CHECKS))).toBeUndefined();
    // The tests write no report.
    expect(await testTime(await repo(undefined))).toBeUndefined();
    // A report from before the run, which the tests did not rewrite.
    const stale = await repo(undefined);
    await writeFiles(stale, { "reports/junit.xml": junit("test/sum.test.ts") });
    expect(await testTime(stale)).toBeUndefined();
    // The tests did not run in this run, as in `task done` with its own verification.
    const skipped = await repo(
      junit("test/sum.test.ts"),
      `checks:\n  levels: { secrets: off, tests: off }\n${TEST_TIME}`,
    );
    expect(await testTime(skipped)).toBeUndefined();
  });
});
