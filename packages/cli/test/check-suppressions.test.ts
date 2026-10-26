// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

// The directives are put together from parts, so that this file does not trip `specty check`.
const ESLINT = `eslint-${"disable"}-next-line`;
const NOQA = `no${"qa"}`;

const CONFIGURED = `${CONFIG()}checks:\n  levels: { secrets: off }\n`;

/** The ids of the checks a run shows. */
async function checkIds(root: string): Promise<string[]> {
  const run = await cli(root, ["check", "--json"]);
  const report: { checks: { id: string }[] } = JSON.parse(run.out);
  return report.checks.map((check) => check.id);
}

describe("the suppressions check of specty check", () => {
  it("fails on each suppression the change adds, in any language, not on the ones already there (AC1)", async () => {
    const root = await tempRepo({
      "package.json": JSON.stringify({ name: "demo", devDependencies: { typescript: "5.9.3" } }),
      "src/old.ts": `// ${ESLINT} no-console\nconsole.log(1);\n`,
      ".specty/config.yaml": CONFIGURED,
    });
    await writeFiles(root, {
      "src/app.ts": `// ${ESLINT} no-console\nconsole.log(2);\n`,
      "tools/build.py": `import os  # ${NOQA}\n`,
      "src/old.ts": `// ${ESLINT} no-console\nconsole.log(1);\nexport const a = 1;\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      [
        "FALLA suppressions",
        `  src/app.ts:1 supresión: ${ESLINT}`,
        `  tools/build.py:1 supresión: ${NOQA}`,
        "",
      ].join("\n"),
    );
    expect(run.out).not.toContain("src/old.ts");
    // With --all, every line counts.
    expect((await cli(root, ["check", "--all"])).out).toContain(
      `src/old.ts:1 supresión: ${ESLINT}`,
    );
  });

  it("speaks English", async () => {
    const root = await tempRepo({
      "package.json": JSON.stringify({ name: "demo" }),
      ".specty/config.yaml": CONFIGURED.replace("language: es", "language: en"),
    });
    await writeFiles(root, { "src/app.js": `run(); // ${ESLINT.replace("-next", "")}\n` });
    expect((await cli(root, ["check"])).out).toContain(
      "src/app.js:1 suppression: eslint-disable-line",
    );
  });

  it("does not show in a Dart repository, whose comments dart-strict watches, nor without a stack (AC3)", async () => {
    const dart = await tempRepo({
      "pubspec.yaml": "name: demo\n",
      ".specty/config.yaml": CONFIGURED,
    });
    expect(await checkIds(dart)).not.toContain("suppressions");
    const bare = await tempRepo({
      "src/app.ts": "export const a = 1;\n",
      ".specty/config.yaml": CONFIGURED,
    });
    expect(await checkIds(bare)).not.toContain("suppressions");
  });
});
