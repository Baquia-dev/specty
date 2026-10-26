// SPDX-License-Identifier: Apache-2.0
import { basename, dirname } from "../paths";
import { splitCode } from "./code";
import type { ResolvedImport } from "./layers";

/**
 * The imports of a Rust file for `layers` (ADR 0012), without tools: each `use` (also `pub use`
 * and one that takes several lines, by its common prefix up to `{`) and each `extern crate`.
 * `crate::a::b` is the path `a/b` under the `src` of the file's crate; `super::` and `self::`
 * start at the file's module; any other first name is its crate (`std`, `serde`).
 */

const USE = /^(?:pub(?:\s*\([^)]*\))?\s+)?use\s+/;
const EXTERN = /^extern\s+crate\s+(\w+)/;
// The files whose module is their folder, not a module named after them.
const FOLDER_MODULES = new Set(["mod.rs", "lib.rs", "main.rs"]);

export function rustImports(path: string, text: string): ResolvedImport[] {
  const lines = splitCode(text, { lifetimes: true }).map((line) => line.code.trim());
  return lines.flatMap((code, index): ResolvedImport[] => {
    const crate = EXTERN.exec(code)?.[1];
    if (crate !== undefined)
      return [{ from: path, specifier: crate, package: crate, line: index + 1 }];
    if (!USE.test(code)) return [];
    const statement = code.replace(USE, "");
    const specifier = statement
      .replace(/\s+as\s+\w+.*$/, "")
      .replace(/::\s*\{.*$|;.*$/, "")
      .replace(/^::/, "")
      .trim();
    return [{ ...resolved(path, specifier), specifier, line: index + 1 }];
  });
}

function resolved(
  from: string,
  specifier: string,
): { readonly from: string } & ({ readonly target: string } | { readonly package: string }) {
  const [first = "", ...rest] = specifier.split("::");
  if (first === "crate") return { from, target: pathOf([srcOf(from), ...rest]) };
  if (first === "self") return { from, target: pathOf([moduleOf(from), ...rest]) };
  if (first === "super") {
    let base = dirname(moduleOf(from));
    let names = rest;
    while (names[0] === "super") {
      base = dirname(base);
      names = names.slice(1);
    }
    return { from, target: pathOf([base, ...names]) };
  }
  return { from, package: first };
}

/** The `src` of the crate the file is in: the last `src` folder of its path. */
function srcOf(path: string): string {
  const parts = path.split("/");
  const at = parts.lastIndexOf("src");
  return at === -1 ? dirname(path) : parts.slice(0, at + 1).join("/");
}

/** The folder of the file's own module: `src/a/b.rs` is `src/a/b`, `src/a/mod.rs` is `src/a`. */
function moduleOf(path: string): string {
  const name = basename(path);
  return FOLDER_MODULES.has(name) ? dirname(path) : path.replace(/\.rs$/, "");
}

function pathOf(parts: readonly string[]): string {
  const names = parts.filter((part) => part !== "");
  return names.length <= 1 ? `${names[0] ?? ""}/lib.rs` : `${names.join("/")}.rs`;
}
