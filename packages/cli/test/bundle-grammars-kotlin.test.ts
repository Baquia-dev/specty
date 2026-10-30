// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, tempRepo, testEnv, writeFiles } from "./support";

const PACKAGE = join(import.meta.dirname, "..");
const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

/** A Kotlin function with a parameter named `record`, of `body + 3` lines of code. */
function run(body: number): string {
  const steps = Array.from({ length: body }, () => "  println(record)");
  return `${["fun run(record: Int): Int {", ...steps, "  return record", "}"].join("\n")}\n`;
}

describe("the Kotlin grammar in the CLI bundle", () => {
  it("AC3: comes compressed with its license, and measures", async () => {
    const out = await mkdtemp(join(tmpdir(), "specty-grammars-kotlin-"));
    execFileSync(process.execPath, ["build.mjs", "--outdir", out], {
      cwd: PACKAGE,
      encoding: "utf8",
      stdio: "pipe",
    });
    expect(await exists(join(out, "grammars", "tree-sitter-kotlin.wasm.br"))).toBe(true);
    const licenses = await readFile(join(out, "grammars", "LICENSES"), "utf8");
    expect(licenses).toContain("== tree-sitter-kotlin: ");
    expect(licenses).toContain("Amaan Qureshi");
    const root = await tempRepo({
      "package.json": `${JSON.stringify({ name: "app" })}\n`,
      ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
      "src/main/kotlin/Run.kt": run(1),
    });
    await writeFiles(root, { "src/main/kotlin/Run.kt": run(5) });
    const result = spawnSync(process.execPath, [join(out, "specty.mjs"), "check"], {
      cwd: root,
      env: testEnv(),
      encoding: "utf8",
    });
    expect(result.stdout).toContain(
      "  src/main/kotlin/Run.kt:1 `run` tiene 8 líneas de código (máximo 5)",
    );
  });
});
