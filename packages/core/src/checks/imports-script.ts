// SPDX-License-Identifier: Apache-2.0
import { dirname } from "../paths";
import { packageName, type ResolvedImport } from "./layers";

/**
 * The imports of a JavaScript or TypeScript file, without tools: `import … from`, `import "…"`,
 * `export … from`, `import()` and `require()`, in the order they come. A relative one is the file
 * it names, with its extension or without it, `.js` for its `.ts`, or its folder's `index`; one
 * of a workspace package is the file its `exports` or `main` gives; any other is a package. A
 * relative one that names no file of the repository is left out.
 */

/** A package of the workspace: its name, and its files by subpath (`.`, `./light`). */
export interface ScriptPackage {
  readonly name: string;
  readonly entries: Readonly<Record<string, string>>;
}

/** The repository's files and its workspace's packages. */
export interface ScriptProject {
  readonly files: ReadonlySet<string>;
  readonly packages: readonly ScriptPackage[];
}

/** Each form an import takes, with the specifier in its first group. */
const FORMS: readonly RegExp[] = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
/** The extensions TypeScript's own files have when an import names them by their output. */
const SOURCES: Readonly<Record<string, readonly string[]>> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

export function scriptImports(
  path: string,
  text: string,
  project: ScriptProject,
): ResolvedImport[] {
  const found = FORMS.flatMap((form) =>
    [...text.matchAll(form)].map((match) => ({ at: match.index, specifier: match[1] ?? "" })),
  ).toSorted((a, b) => a.at - b.at);
  return found.flatMap(({ at, specifier }) => {
    const resolved = resolve(path, specifier, project);
    if (resolved === undefined) return [];
    const line = text.slice(0, at).split("\n").length;
    return [{ from: path, specifier, line, ...resolved }];
  });
}

function resolve(
  from: string,
  specifier: string,
  project: ScriptProject,
): { readonly target: string } | { readonly package: string } | undefined {
  if (specifier.startsWith(".")) {
    const base = joined(dirname(from), specifier);
    const target =
      base === undefined ? undefined : candidates(base).find((path) => project.files.has(path));
    return target === undefined ? undefined : { target };
  }
  const own = project.packages.find(
    (each) => specifier === each.name || specifier.startsWith(`${each.name}/`),
  );
  const entry = own?.entries[`.${specifier.slice(own.name.length)}`];
  return entry !== undefined && project.files.has(entry)
    ? { target: entry }
    : { package: packageName(specifier) };
}

/** The files a relative import may name: itself, its sources, with an extension, or an index. */
function candidates(base: string): string[] {
  const extension = /\.[cm]?[jt]sx?$/.exec(base)?.[0];
  const stem = extension === undefined ? base : base.slice(0, -extension.length);
  const sources = (extension === undefined ? [] : (SOURCES[extension] ?? [])).map(
    (source) => `${stem}${source}`,
  );
  return [
    base,
    ...sources,
    ...EXTENSIONS.map((each) => `${base}${each}`),
    ...EXTENSIONS.map((each) => `${base}/index${each}`),
  ];
}

/** `relative` from the folder `dir`, its `.` and `..` resolved; undefined when it leaves the repo. */
function joined(dir: string, relative: string): string | undefined {
  const parts = dir === "" ? [] : dir.split("/");
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") parts.push(segment);
    else if (parts.pop() === undefined) return undefined;
  }
  return parts.join("/");
}
