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
  const out = await mkdtemp(join(tmpdir(), "specty-grammars-modern-"));
  execFileSync(process.execPath, ["build.mjs", "--outdir", out], {
    cwd: PACKAGE,
    encoding: "utf8",
    stdio: "pipe",
  });
  return out;
}

/** A Go and a Dart function, each with a parameter named `record` and `body + 3` lines. */
function sources(body: number): Record<string, string> {
  const steps = (line: string) => Array.from({ length: body }, () => line);
  const go = ["package app", "", "func run(record int) int {", ...steps("\trecord += 1")];
  const dart = ["int run(int record) {", ...steps("  record += 1;"), "  return record;", "}"];
  return {
    "src/run.go": `${[...go, "\treturn record", "}"].join("\n")}\n`,
    "lib/run.dart": `${dart.join("\n")}\n`,
  };
}

describe("the grammars of Go, Rust, Swift and Dart in the CLI bundle", () => {
  it("AC4: carry them compressed with their licenses, and measure with them", async () => {
    const out = await bundle();
    for (const file of ["go", "rust", "swift", "dart"]) {
      expect(await exists(join(out, "grammars", `tree-sitter-${file}.wasm.br`))).toBe(true);
    }
    const licenses = await readFile(join(out, "grammars", "LICENSES"), "utf8");
    for (const grammar of ["go", "rust", "swift", "dart"]) {
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
    expect(run.stdout).toContain("  src/run.go:3 `run` tiene 8 líneas de código (máximo 5)");
    expect(run.stdout).toContain("  lib/run.dart:1 `run` tiene 8 líneas de código (máximo 5)");
  });
});
