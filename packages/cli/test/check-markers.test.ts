// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, tempRepo, writeFiles } from "./support";

// The markers are put together from parts, so that this file does not trip `specty check`.
const ONLY = ".only";
const SKIP = ".skip";
const TODO = "TODO";
const FIXME = "FIXME";

async function repo(files: Readonly<Record<string, string>> = {}, config = ""): Promise<string> {
  return tempRepo({
    "src/app.ts": "export const a = 1;\n",
    ".specty/config.yaml": `${CONFIG()}${config}`,
    ...files,
  });
}

describe("the marker checks of specty check", () => {
  it("fail on a focused test, only in test files", async () => {
    const root = await repo();
    await writeFiles(root, {
      "src/app.test.ts": `describe("app", () => {\n  it${ONLY}("works", () => {});\n});\n`,
      "test/widget_test.dart": `void main() {\n  test('renders', () {}, solo${": true"});\n}\n`,
      "src/guide.ts": `// Write describe${ONLY}("x") to run one suite.\nexport const tip = "describe${ONLY}";\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA focused-tests",
        `  src/app.test.ts:2 test enfocado: it${ONLY}`,
        `  test/widget_test.dart:2 test enfocado: solo${": true"}`,
        "OK 3/4 · FALLA: focused-tests",
      ].join("\n"),
    );
  });

  it("fail on a test switched off by a marker, not on a conditional skip", async () => {
    const root = await repo();
    await writeFiles(root, {
      "src/app.test.ts": [
        `it${SKIP}("later", () => {});`,
        `test${SKIP}If(process.platform === "win32")("posix", () => {});`,
        "",
      ].join("\n"),
      "tests/test_api.py": `import pytest\n\n@pytest.mark.${"skip"}(reason="slow")\ndef test_api():\n    pass\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        "FALLA skipped-tests",
        `  src/app.test.ts:1 test omitido: it${SKIP}`,
        `  tests/test_api.py:3 test omitido: @pytest.mark.${"skip"}`,
        "OK 3/4 · FALLA: skipped-tests",
      ].join("\n"),
    );
  });

  it("look only at the lines the change adds, and at every line with --all", async () => {
    const root = await repo({
      "src/app.ts": `// ${TODO}: an old one\nexport const a = 1;\n`,
      "src/my notes.ts": `// ${FIXME} an old one\nexport const b = 2;`,
      "src/old.ts": `// ${TODO}: moved\n`,
      "src/gone.ts": `// ${TODO}: deleted\n`,
    });
    await writeFiles(root, {
      "src/app.ts": [
        `// ${TODO}: an old one`,
        "export const a = 1;",
        `// ${TODO}: a new one`,
        `// ${TODO}(#12): with its issue`,
        `export const status = "${TODO}";`,
        "",
      ].join("\n"),
      "src/my notes.ts": `// ${FIXME} an old one\nexport const b = 2;\n// ${FIXME} a new one\n`,
    });
    git(root, "mv", "src/old.ts", "src/new.ts");
    git(root, "rm", "-q", "src/gone.ts");
    const changed = await cli(root, ["check"]);
    expect(changed.code).toBe(1);
    expect(changed.out).toBe(
      [
        "FALLA todo",
        `  src/app.ts:3 ${TODO} sin referencia a un issue`,
        `  src/my notes.ts:3 ${FIXME} sin referencia a un issue`,
        "OK 3/4 · FALLA: todo",
      ].join("\n"),
    );
    const all = await cli(root, ["check", "--all"]);
    expect(all.out).toContain(`  src/app.ts:1 ${TODO} sin referencia a un issue`);
    expect(all.out).toContain(`  src/new.ts:1 ${TODO} sin referencia a un issue`);
  });

  it("judge the staged lines with --staged, by their staged line", async () => {
    const root = await repo();
    await writeFiles(root, { "src/app.ts": `export const a = 1;\n// ${TODO}: staged\n` });
    git(root, "add", "src/app.ts");
    await writeFiles(root, { "src/app.ts": "export const a = 1;\n" });
    const staged = await cli(root, ["check", "--staged"]);
    expect(staged.code).toBe(1);
    expect(staged.out).toContain(`  src/app.ts:2 ${TODO} sin referencia a un issue`);
    expect((await cli(root, ["check"])).code).toBe(0);
  });

  it("follow the level of each check and the configured reference, in English too", async () => {
    const config = [
      "checks:",
      "  levels: { todo: warn, focused-tests: off }",
      "  todo: { reference: '\\bPROJ-\\d+\\b' }",
      "",
    ].join("\n");
    const root = await repo();
    await writeFiles(root, {
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${config}`,
      "src/app.ts": `// ${TODO} PROJ-4 tracked\n// ${TODO} #4 elsewhere\n`,
      "src/app.test.ts": `describe${ONLY}("app", () => {});\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(0);
    expect(run.out).toBe(
      [
        "WARN todo",
        `  src/app.ts:2 ${TODO} without an issue reference`,
        "OK 2/3 · WARN: todo",
      ].join("\n"),
    );
  });
});
