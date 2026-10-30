// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CONFIG, tempRepo, testEnv, writeFiles } from "./support";

const PACKAGE = join(import.meta.dirname, "..");
const CHECKS =
  "checks:\n  levels: { secrets: off, tests: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

/** A module whose `def total` has `body + 3` lines of code. */
function orders(body: number): string {
  const steps = Array.from({ length: body }, (_, index) => `    IO.puts(${index})`);
  const lines = ["defmodule Orders do", "  def total(x) do", ...steps, "    x", "  end", "end"];
  return `${lines.join("\n")}\n`;
}

describe("the Elixir grammar in the CLI bundle", () => {
  it("AC4: comes compressed with its Apache-2.0 license, and measures", async () => {
    const out = await mkdtemp(join(tmpdir(), "specty-grammars-elixir-"));
    execFileSync(process.execPath, ["build.mjs", "--outdir", out], {
      cwd: PACKAGE,
      encoding: "utf8",
      stdio: "pipe",
    });
    expect(await exists(join(out, "grammars", "tree-sitter-elixir.wasm.br"))).toBe(true);
    const licenses = await readFile(join(out, "grammars", "LICENSES"), "utf8");
    expect(licenses).toContain("== tree-sitter-elixir: ");
    expect(licenses).toContain("Apache License");
    const root = await tempRepo({
      "mix.exs": "defmodule App.MixProject do\nend\n",
      ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
      "lib/orders.ex": orders(1),
    });
    await writeFiles(root, { "lib/orders.ex": orders(5) });
    const run = spawnSync(process.execPath, [join(out, "specty.mjs"), "check"], {
      cwd: root,
      env: testEnv(),
      encoding: "utf8",
    });
    expect(run.stdout).toContain("  lib/orders.ex:2 `total` tiene 8 líneas de código (máximo 5)");
  });
});
