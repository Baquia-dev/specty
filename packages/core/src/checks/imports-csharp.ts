// SPDX-License-Identifier: Apache-2.0
import { dirname } from "../paths";
import type { ResolvedImport } from "./layers";

/**
 * The `using` directives of a C# file for `layers` (ADR 0012), without tools: `using A.B;`,
 * `global using`, `using static` and aliases (`using X = A.B.C;`), but not a `using var`
 * declaration or a `using (…)` statement. The project's namespaces are the ones its files
 * declare: a name that is one of them, or is one without its last part (the type of a static
 * using or an alias), goes to the folder of the first file that declares it. Any other is its
 * package, by its full name (`Microsoft.EntityFrameworkCore`).
 */

/** A namespace of the project, and the folder of the first file that declares it. */
export type Namespaces = ReadonlyMap<string, string>;

const NAMESPACE = /^\s*namespace\s+([\w.]+)/m;
const USING = /^\s*(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/;

export function csharpNamespaces(
  sources: readonly { readonly path: string; readonly text: string }[],
): Namespaces {
  const namespaces = new Map<string, string>();
  for (const { path, text } of sources) {
    const name = NAMESPACE.exec(text.replace(/\/\/.*$/gm, ""))?.[1];
    if (name !== undefined && !namespaces.has(name)) namespaces.set(name, dirname(path));
  }
  return namespaces;
}

export function csharpImports(
  path: string,
  text: string,
  namespaces: Namespaces,
): ResolvedImport[] {
  return text.split(/\r?\n/).flatMap((raw, index): ResolvedImport[] => {
    const specifier = USING.exec(raw.replace(/\/\/.*$/, ""))?.[1];
    if (specifier === undefined) return [];
    const folder = namespaces.get(specifier) ?? namespaces.get(specifier.replace(/\.\w+$/, ""));
    const resolved =
      folder === undefined
        ? { package: specifier }
        : { target: `${folder === "" ? "" : `${folder}/`}*.cs` };
    return [{ from: path, specifier, ...resolved, line: index + 1 }];
  });
}
