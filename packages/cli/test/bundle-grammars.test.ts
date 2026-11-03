// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, tempRepo, testEnv, writeFiles } from "./support";

const PACKAGE = join(import.meta.dirname, "..");

/** Builds the CLI into a new temporary folder, where no `node_modules` can be found. */
async function bundle(): Promise<string> {
  const out = await mkdtemp(join(tmpdir(), "specty-grammars-"));
  execFileSync(process.execPath, ["build.mjs", "--outdir", out], {
    cwd: PACKAGE,
    encoding: "utf8",
    stdio: "pipe",
  });
  return out;
}

const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

/**
 * A repository whose change grows two functions past the limit: `deriveView`, whose parameter
 * `record` hides it from the line estimator, and `fresh`, which both measures see.
 */
async function grownRepo(): Promise<string> {
  const lines = (name: string, parameter: string, body: number) =>
    [
      `export function ${name}(${parameter}): number {`,
      ...Array.from({ length: body }, (_, index) => `  ${parameter.split(":")[0]} += ${index};`),
      "  return 0;",
      "}",
    ].join("\n");
  const root = await tempRepo({
    "package.json": `${JSON.stringify({ name: "app" })}\n`,
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    "src/view.ts": `${lines("deriveView", "record: number", 1)}\n`,
  });
  await writeFiles(root, {
    "src/view.ts": `${lines("deriveView", "record: number", 5)}\n\n${lines("fresh", "x: number", 4)}\n`,
  });
  return root;
}

/** `specty check` from the bundle in `out`. */
function check(out: string, cwd: string) {
  return spawnSync(process.execPath, [join(out, "specty.mjs"), "check"], {
    cwd,
    env: testEnv(),
    encoding: "utf8",
  });
}

describe("the grammars of the CLI bundle", () => {
  it("AC6: carry the runtime, the compressed grammars and their licenses, and measure with them", async () => {
    const out = await bundle();
    for (const name of [
      "web-tree-sitter",
      "tree-sitter-typescript",
      "tree-sitter-tsx",
      "tree-sitter-javascript",
    ]) {
      expect(await exists(join(out, "grammars", `${name}.wasm.br`))).toBe(true);
    }
    const licenses = await readFile(join(out, "grammars", "LICENSES"), "utf8");
    for (const name of ["web-tree-sitter", "tree-sitter-typescript", "tree-sitter-javascript"]) {
      expect(licenses).toContain(name);
    }
    expect(licenses).toContain("MIT");
    const run = check(out, await grownRepo());
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("src/view.ts:1 `deriveView` tiene 8 líneas de código (máximo 5)");
    expect(run.stdout).toContain("src/view.ts:10 `fresh` tiene 7 líneas de código (máximo 5)");
  });

  it("AC4: measure with the line estimator when the grammar of a file is missing", async () => {
    const out = await bundle();
    await rm(join(out, "grammars", "tree-sitter-typescript.wasm.br"));
    const run = check(out, await grownRepo());
    expect(run.status).toBe(1);
    expect(run.stderr).not.toMatch(/error/i);
    expect(run.stdout).toContain("src/view.ts:10 `fresh` tiene 7 líneas de código (máximo 5)");
    // The estimator does not see `deriveView`: that is how the test knows which one measured.
    expect(run.stdout).not.toContain("deriveView");
  });
});
