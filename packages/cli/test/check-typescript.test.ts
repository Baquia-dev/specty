// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const ANY = "`any` explícito: usa un tipo concreto o `unknown`";
const TS_COMMENT = "`@ts-ignore` o `@ts-nocheck` apaga el compilador";
const NON_NULL = "aserción no nula (`!`): comprueba el valor";

async function repo(
  devDependencies: Readonly<Record<string, string>>,
  files: Readonly<Record<string, string>> = {},
): Promise<string> {
  return tempRepo({
    "package.json": json({ name: "app", devDependencies }),
    "tsconfig.json": json({ compilerOptions: { strict: true } }),
    ".gitignore": "node_modules/\n",
    "src/app.ts": "export const old: any = 1;\n",
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    ...files,
  });
}

/** A fake ESLint that logs its arguments and reports the messages of `flavor`. */
async function fakeEslint(root: string, flavor: "report" | "broken"): Promise<string> {
  const log = join(await mkdtemp(join(tmpdir(), "specty-eslint-")), "args.json");
  const bin = join(root, "node_modules/.bin/eslint");
  await writeFiles(root, {
    "node_modules/.bin/eslint": `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(args));
if (${JSON.stringify(flavor)} === "broken") {
  console.error("Oops! Something went wrong!");
  console.error('ESLint couldn\\'t find the plugin "@typescript-eslint/eslint-plugin".');
  process.exit(2);
}
const results = [{
  filePath: path.resolve("src/app.ts"),
  messages: [
    { ruleId: "@typescript-eslint/ban-ts-comment", line: 1, message: "Use @ts-expect-error." },
    { ruleId: "@typescript-eslint/no-explicit-any", line: 2, message: "Unexpected any." },
    { ruleId: "no-console", line: 2, message: "Unexpected console statement." },
  ],
}];
fs.writeFileSync(args[args.indexOf("--output-file") + 1], JSON.stringify(results));
process.exit(1);
`,
  });
  await chmod(bin, 0o755);
  return log;
}

describe("strict-types in specty check", () => {
  it("finds what strict TypeScript forbids on the added lines, without ESLint", async () => {
    const root = await repo({ typescript: "5.9.0" });
    await writeFiles(root, {
      "src/app.ts": [
        "export const old: any = 1;",
        "export const list: Array<any> = [];",
        "// @ts-ignore",
        "export const name = (user?: { name: string }) => user!.name;",
        'export const label = "as any";',
        "",
      ].join("\n"),
      "src/types.d.ts": "declare const loose: any;\n",
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA strict-types",
        `  src/app.ts:2 ${ANY}`,
        `  src/app.ts:3 ${TS_COMMENT}`,
        `  src/app.ts:4 ${NON_NULL}`,
        "OK 6/7 · FALLA: strict-types",
      ].join("\n"),
    );
    expect((await cli(root, ["check", "--all"])).out).toContain(`  src/app.ts:1 ${ANY}`);
  });

  it("asks the project's ESLint with typescript-eslint, and keeps only its three rules", async () => {
    const root = await repo({ eslint: "9.30.0", "typescript-eslint": "8.40.0" });
    const log = await fakeEslint(root, "report");
    await writeFiles(root, {
      "src/app.ts": "export const old: any = 1;\nexport const fresh: any = 2;\n",
      "lib/notes.md": "# not code\n",
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(["FALLA strict-types", `  src/app.ts:2 ${ANY}`].join("\n"));
    expect(run.out).not.toContain("src/app.ts:1");
    const args: string[] = JSON.parse(await readFile(log, "utf8"));
    expect(args).toEqual([
      "--format",
      "json",
      "--no-warn-ignored",
      "--rule",
      "@typescript-eslint/no-explicit-any: error",
      "--rule",
      "@typescript-eslint/ban-ts-comment: error",
      "--rule",
      "@typescript-eslint/no-non-null-assertion: error",
      "--output-file",
      expect.stringMatching(/eslint\.json$/),
      "src/app.ts",
    ]);
    await cli(root, ["check", "--all"]);
    expect(JSON.parse(await readFile(log, "utf8")).at(-1)).toBe(".");
  });

  it("does not run when ESLint fails, and shows its error, in English too", async () => {
    const root = await repo({ "@typescript-eslint/eslint-plugin": "8.40.0" });
    await fakeEslint(root, "broken");
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${CHECKS}`,
      "src/app.ts": "export const old: any = 1;\nexport const fresh = 2;\n",
    });
    const run = await cli(root, ["check", "--verbose"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      'NOT RUN strict-types: eslint: ESLint couldn\'t find the plugin "@typescript-eslint/eslint-plugin".',
    );
  });

  it("says it in English, and is absent from a project with no TypeScript", async () => {
    const root = await repo({ typescript: "5.9.0" });
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${CHECKS}`,
      "src/app.ts": "export const old: any = 1;\nexport const v = cache!;\n",
    });
    expect((await cli(root, ["check"])).out).toContain(
      "  src/app.ts:2 non-null assertion (`!`): check the value",
    );
    const plain = await tempRepo({
      "package.json": json({ name: "app" }),
      "src/app.js": "export const a = 1;\n",
      ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    });
    expect((await cli(plain, ["check"])).out).toBe("OK 6/6");
  });
});
