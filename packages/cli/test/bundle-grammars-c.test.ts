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

/** Builds the CLI into a new temporary folder, where no `node_modules` can be found. */
async function bundle(): Promise<string> {
  const out = await mkdtemp(join(tmpdir(), "specty-grammars-c-"));
  execFileSync(process.execPath, ["build.mjs", "--outdir", out], {
    cwd: PACKAGE,
    encoding: "utf8",
    stdio: "pipe",
  });
  return out;
}

/** A Java method and a C function, each with a parameter named `record` and `body + 3` lines. */
function sources(body: number): Record<string, string> {
  const steps = (line: string) => Array.from({ length: body }, () => line);
  return {
    "src/Orders.java": `${["class Orders {", "  int run(int record) {", ...steps("    record += 1;"), "    return record;", "  }", "}"].join("\n")}\n`,
    "src/run.c": `${["int run(int record) {", ...steps("  record += 1;"), "  return record;", "}"].join("\n")}\n`,
  };
}

describe("the grammars of the C family in the CLI bundle", () => {
  it("AC4: carry Java, C#, PHP, C and C++ compressed with their licenses, and measure with them", async () => {
    const out = await bundle();
    for (const file of ["java", "c_sharp", "php", "c", "cpp"]) {
      expect(await exists(join(out, "grammars", `tree-sitter-${file}.wasm.br`))).toBe(true);
    }
    const licenses = await readFile(join(out, "grammars", "LICENSES"), "utf8");
    for (const grammar of ["java", "c-sharp", "php", "c", "cpp"]) {
      expect(licenses).toContain(`== tree-sitter-${grammar}: `);
    }
    const root = await tempRepo({
      "package.json": `${JSON.stringify({ name: "app" })}\n`,
      ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
      ...sources(1),
    });
    await writeFiles(root, sources(5));
    const run = spawnSync(process.execPath, [join(out, "specty.mjs"), "check"], {
      cwd: root,
      env: testEnv(),
      encoding: "utf8",
    });
    expect(run.stdout).toContain("  src/Orders.java:2 `run` tiene 8 líneas de código (máximo 5)");
    expect(run.stdout).toContain("  src/run.c:1 `run` tiene 8 líneas de código (máximo 5)");
  });
});
