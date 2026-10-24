// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";

/** A node script that prints `lines` and exits with `code`. */
const script = (code: number, ...lines: string[]) =>
  `${lines.map((line) => `console.log(${JSON.stringify(line)});`).join("\n")}\nprocess.exit(${code});\n`;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function repo(files: Readonly<Record<string, string>>, config = CHECKS): Promise<string> {
  return tempRepo({
    "src/app.ts": "export const a = 1;\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
    ...files,
  });
}

describe("the project's commands in specty check", () => {
  it("runs the scripts it detects, and shows where a failing one points", async () => {
    const root = await repo({
      "package.json": json({
        name: "app",
        scripts: {
          lint: "node tools/lint.js",
          typecheck: "node tools/ok.js",
          test: "node tools/ok.js",
          "format:check": "node tools/ok.js",
        },
      }),
      "tools/ok.js": script(0, "all good"),
      "tools/lint.js": script(1, "lib/other.ts:9:1 - error no-y", "src/app.ts:3:1 - error no-x"),
    });
    await writeFiles(root, { "src/app.ts": "export const a = 2;\n" });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA lint",
        "  `npm run lint` salió con 1",
        "  src/app.ts:3 error no-x",
        "  lib/other.ts:9 error no-y",
        "OK 7/8 · FALLA: lint",
      ].join("\n"),
    );
    const report = JSON.parse((await cli(root, ["--json", "check"])).out);
    expect(report.checks.map((check: { id: string }) => check.id).slice(0, 4)).toEqual([
      "format",
      "lint",
      "typecheck",
      "tests",
    ]);
  });

  it("uses checks.commands over what it detects, and leaves out a check with no command", async () => {
    const config = [
      "checks:",
      "  levels: { secrets: off }",
      "  maxFindings: 2",
      "  commands:",
      '    tests: "node tools/tests.js"',
      "",
    ].join("\n");
    const root = await repo(
      {
        "package.json": json({ name: "app", scripts: { test: "node tools/never.js" } }),
        "tools/tests.js": script(
          2,
          "FAIL src/a.test.ts:1:1 one",
          "FAIL src/b.test.ts:1:1 two",
          "FAIL src/c.test.ts:1:1 three",
        ),
      },
      config,
    );
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA tests",
        "  `node tools/tests.js` salió con 2",
        "  src/a.test.ts:1 one",
        "  … y 2 más",
        "OK 4/5 · FALLA: tests",
      ].join("\n"),
    );
  });

  it("fails a command that runs past the time limit, in English too", async () => {
    const config = [
      "checks:",
      "  levels: { secrets: off }",
      "  commands:",
      '    lint: "node tools/slow.js"',
      "",
    ].join("\n");
    const root = await repo({ "tools/slow.js": "setTimeout(() => {}, 60000);\n" }, config);
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG()
        .replace("language: es", "language: en")
        .replace("verify:\n", "verify:\n  timeoutSec: 1\n")}${config}`,
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("FAIL lint\n  `node tools/slow.js` ran past the time limit (1 s)");
  });

  it("runs nothing for a repository with no commands", async () => {
    const root = await repo({});
    expect((await cli(root, ["check"])).out).toBe("OK 4/4");
  });
});
