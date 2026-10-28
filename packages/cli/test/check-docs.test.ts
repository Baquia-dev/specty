// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

const DOCS = join(import.meta.dirname, "..", "..", "..", "docs");

/** Every provider applies: TypeScript and Dart, layers, a generator, the project's four commands. */
const CHECKS = [
  "checks:",
  "  levels: { secrets: off }",
  '  commands: { format: "true", lint: "true", typecheck: "true", tests: "true" }',
  '  layers: { domain: { paths: ["src/domain/**"] } }',
  '  generators: [{ command: "true", outputs: ["gen/**"] }]',
  "",
].join("\n");

/** The ids of every check `specty check --spec` runs where all its providers apply. */
async function checkIds(): Promise<string[]> {
  const root = await tempRepo({
    "package.json": JSON.stringify({ name: "demo", devDependencies: { typescript: "5.9.3" } }),
    "pubspec.yaml": "name: demo\n",
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  // `secrets` is off above, so that no scanner on the machine runs; its level puts it back.
  // `tests-locked` only shows where a change has approved tests (ADR 0014).
  const run = await cli(root, ["check", "--spec", "--verbose", "--json"]);
  const report: { checks: { id: string }[] } = JSON.parse(run.out);
  return [...report.checks.map((check) => check.id), "secrets", "tests-locked"].toSorted();
}

/** The checks a guide documents: its headings that are only an id in backticks. */
async function documented(file: string): Promise<string[]> {
  const text = await readFile(join(DOCS, file), "utf8");
  return [...text.matchAll(/^### `([a-z-]+)`$/gm)].map(([, id = ""]) => id).toSorted();
}

describe("the guides of specty check", () => {
  it("document exactly the checks there are, in Spanish and in English", async () => {
    const ids = await checkIds();
    expect(ids).toContain("dart-strict");
    expect(ids).toContain("tests-removed");
    expect(await documented("checks.md")).toEqual(ids);
    expect(await documented("checks.en.md")).toEqual(ids);
  });
});
