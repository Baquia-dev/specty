// SPDX-License-Identifier: Apache-2.0
import type { ResolvedImport } from "./layers";

/**
 * The imports of a Go file for `layers` (ADR 0012), without tools: each `import "path"`, with or
 * without an alias, in a line or in a block. A path under the module of `go.mod` is a folder of
 * the project, `<folder>/*.go`; any other path is its own package (`fmt`, `github.com/x/y`).
 */

/** The module of `go.mod`, and the folder of the repository where it lives (`""` at the root). */
export interface GoModule {
  readonly path: string;
  readonly dir: string;
}

const SINGLE = /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/;
const IN_BLOCK = /^\s*(?:[\w.]+\s+)?"([^"]+)"/;

export function goImports(
  path: string,
  text: string,
  module: GoModule | undefined,
): ResolvedImport[] {
  let block = false;
  return text.split(/\r?\n/).flatMap((raw, index): ResolvedImport[] => {
    const line = raw.replace(/\/\/.*$/, "");
    if (/^\s*import\s*\(/.test(line)) {
      block = true;
      return [];
    }
    if (block && /^\s*\)/.test(line)) block = false;
    const specifier = (block ? IN_BLOCK : SINGLE).exec(line)?.[1];
    if (specifier === undefined) return [];
    return [{ ...resolved(path, specifier, module), specifier, line: index + 1 }];
  });
}

function resolved(
  from: string,
  specifier: string,
  module: GoModule | undefined,
): { readonly from: string } & ({ readonly target: string } | { readonly package: string }) {
  if (module === undefined) return { from, package: specifier };
  const inside = specifier === module.path || specifier.startsWith(`${module.path}/`);
  if (!inside) return { from, package: specifier };
  const folder = [module.dir, specifier.slice(module.path.length + 1)].filter(
    (part) => part !== "",
  );
  return { from, target: [...folder, "*.go"].join("/") };
}
