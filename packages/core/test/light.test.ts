// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as index from "../src";
import * as light from "../src/light";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

/** What the light entry must never load: the parser's and the scope's dependencies. */
const HEAVY = ["zod", "yaml", "picomatch", "@noble/hashes"];

/**
 * An import or re-export with `from`. Only `import type` and `export type` vanish when compiled:
 * one with inline types alone still loads its module.
 */
const STATEMENT =
  /^(?:import|export)\s+(type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+)\s+from\s+"([^"]+)"/gm;

/** The core files and the packages that `file` loads at run time, following core's own files. */
function loaded(file: string, files = new Set<string>(), packages = new Set<string>()) {
  if (files.has(file)) return { files, packages };
  files.add(file);
  for (const [, typeOnly, specifier = ""] of readFileSync(file, "utf8").matchAll(STATEMENT)) {
    if (typeOnly !== undefined) continue;
    if (!specifier.startsWith(".")) {
      packages.add(specifier);
      continue;
    }
    const base = resolve(dirname(file), specifier);
    const next = [`${base}.ts`, join(base, "index.ts")].find((path) => existsSync(path));
    if (next !== undefined) loaded(next, files, packages);
  }
  return { files, packages };
}

describe("core's light entry", () => {
  it("AC1: loads only light modules: none of the parser's dependencies", () => {
    const { files, packages } = loaded(join(SRC, "light.ts"));
    const relative = [...files].map((file) => file.slice(SRC.length + 1));
    expect(relative).toEqual(
      expect.arrayContaining(["light.ts", "i18n.ts", "flow/phases.ts", "cards/text.ts"]),
    );
    expect([...packages].filter((name) => HEAVY.some((heavy) => name.startsWith(heavy)))).toEqual(
      [],
    );
  });

  it("AC1: gives the same values as the index", () => {
    expect(light.LANGS).toBe(index.LANGS);
    expect(light.fold).toBe(index.fold);
    expect(light.translator).toBe(index.translator);
    expect(light.PHASES).toBe(index.PHASES);
  });

  it("AC1: sees what the index loads, so the walk finds the parser's dependencies there", () => {
    const { packages } = loaded(join(SRC, "index.ts"));
    expect([...packages]).toEqual(expect.arrayContaining(["zod", "yaml"]));
  });
});
