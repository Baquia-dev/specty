// SPDX-License-Identifier: Apache-2.0
import { dirname } from "../paths";
import type { ResolvedImport } from "./layers";

/**
 * The imports of a Java or Kotlin file for `layers` (ADR 0012), without tools: each `import a.b.C`,
 * with or without `;` and alias, `import static` and `a.b.*`. The project's packages are the
 * folders that hold its `.java` and `.kt` files: an import whose first names, two at least, end
 * the path of one of them is the project's, and goes to that folder. Any other is its package, by
 * its full name (`org.springframework.stereotype.Service`).
 */

/** The project's source files, and the folder of each package by the ends of its path. */
export interface JvmPackages {
  readonly files: ReadonlySet<string>;
  readonly folders: ReadonlyMap<string, string>;
}

const SOURCE = /\.(?:java|kt)$/;
const IMPORT = /^\s*import\s+(?:static\s+)?(\w+(?:\.\w+)*(?:\.\*)?)/;

export function jvmPackages(files: readonly string[]): JvmPackages {
  const sources = files.filter((file) => SOURCE.test(file));
  const folders = new Map<string, string>();
  for (const folder of new Set(sources.map(dirname))) {
    const parts = folder.split("/");
    for (let start = 0; start <= parts.length - 2; start += 1) {
      const end = parts.slice(start).join("/");
      if (!folders.has(end)) folders.set(end, folder);
    }
  }
  return { files: new Set(sources), folders };
}

export function jvmImports(path: string, text: string, packages: JvmPackages): ResolvedImport[] {
  return text.split(/\r?\n/).flatMap((raw, index): ResolvedImport[] => {
    const specifier = IMPORT.exec(raw.replace(/\/\/.*$/, ""))?.[1];
    if (specifier === undefined) return [];
    return [{ ...resolved(path, specifier, packages), specifier, line: index + 1 }];
  });
}

function resolved(
  from: string,
  specifier: string,
  packages: JvmPackages,
): { readonly from: string } & ({ readonly target: string } | { readonly package: string }) {
  const names = specifier.replace(/\.\*$/, "").split(".");
  for (let count = names.length; count >= 2; count -= 1) {
    const folder = packages.folders.get(names.slice(0, count).join("/"));
    if (folder === undefined) continue;
    const type = names[count];
    const file = ["java", "kt"]
      .map((extension) => `${folder}/${type ?? ""}.${extension}`)
      .find((candidate) => packages.files.has(candidate));
    return { from, target: file ?? `${folder}/*` };
  }
  return { from, package: specifier };
}
