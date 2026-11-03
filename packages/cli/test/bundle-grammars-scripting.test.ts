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

/** A Ruby method of `body + 4` lines of code that calls `range.end`, which is not its `end`. */
function span(body: number): string {
  const steps = Array.from({ length: body }, () => "  last += 1");
  return `${["def span(range)", "  last = range.end", ...steps, "  last", "end"].join("\n")}\n`;
}

describe("the Python and Ruby grammars in the CLI bundle", () => {
  it("AC5: come compressed with their licenses, and measure", async () => {
    const out = await mkdtemp(join(tmpdir(), "specty-grammars-scripting-"));
    execFileSync(process.execPath, ["build.mjs", "--outdir", out], {
      cwd: PACKAGE,
      encoding: "utf8",
      stdio: "pipe",
    });
    for (const grammar of ["python", "ruby"]) {
      expect(await exists(join(out, "grammars", `tree-sitter-${grammar}.wasm.br`))).toBe(true);
    }
    const licenses = await readFile(join(out, "grammars", "LICENSES"), "utf8");
    expect(licenses).toContain("== tree-sitter-python: ");
    expect(licenses).toContain("== tree-sitter-ruby: ");
    const root = await tempRepo({
      "package.json": `${JSON.stringify({ name: "app" })}\n`,
      ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
      "lib/span.rb": span(0),
    });
    await writeFiles(root, { "lib/span.rb": span(5) });
    const run = spawnSync(process.execPath, [join(out, "specty.mjs"), "check"], {
      cwd: root,
      env: testEnv(),
      encoding: "utf8",
    });
    expect(run.stdout).toContain("  lib/span.rb:1 `span` tiene 9 líneas de código (máximo 5)");
  });
});
