// SPDX-License-Identifier: Apache-2.0
import { dirname } from "../paths";
import type { ResolvedImport } from "./layers";

/**
 * The imports of a Python file for `layers` (ADR 0012), without tools: `import a.b` and
 * `from a.b import c`. A module is the project's when it is a file or a folder of the repository,
 * at its root or under `src/`; otherwise it is the package of its first name. A relative import
 * is always the project's, from the folder of the file.
 */

/** The repository's files, and the folders that hold them. */
export interface PythonProject {
  readonly files: ReadonlySet<string>;
  readonly folders: ReadonlySet<string>;
}

const ROOTS = ["", "src"];
const IMPORT = /^\s*import\s+(.+)$/;
const FROM = /^\s*from\s+(\.*)([\w.]*)\s+import\b/;

export function pythonProject(files: readonly string[]): PythonProject {
  const folders = new Set<string>();
  for (const file of files) {
    for (let folder = dirname(file); folder !== ""; folder = dirname(folder)) folders.add(folder);
  }
  return { files: new Set(files), folders };
}

export function pythonImports(
  path: string,
  text: string,
  project: PythonProject,
): ResolvedImport[] {
  return text.split(/\r?\n/).flatMap((raw, index): ResolvedImport[] => {
    const line = raw.replace(/#.*$/, "");
    const relative = FROM.exec(line);
    if (relative !== null) {
      const [, dots = "", module = ""] = relative;
      const specifier = `${dots}${module}`;
      return [{ ...resolved(path, dots, module, project), specifier, line: index + 1 }];
    }
    const modules = IMPORT.exec(line)?.[1]?.split(",") ?? [];
    return modules.flatMap((part) => {
      const module = /^\s*([\w.]+)/.exec(part)?.[1];
      if (module === undefined) return [];
      return [{ ...resolved(path, "", module, project), specifier: module, line: index + 1 }];
    });
  });
}

function resolved(
  from: string,
  dots: string,
  module: string,
  project: PythonProject,
): { readonly from: string } & ({ readonly target: string } | { readonly package: string }) {
  const names = module === "" ? [] : module.split(".");
  if (dots !== "") {
    let base = dirname(from);
    for (let level = 1; level < dots.length; level += 1) base = dirname(base);
    return { from, target: targetOf([base, ...names], project) ?? `${join([base, ...names])}.py` };
  }
  for (const root of ROOTS) {
    const target = targetOf([root, ...names], project);
    if (target !== undefined) return { from, target };
  }
  return { from, package: names[0] ?? module };
}

/** The module's file, or a file in its folder, when the repository has either. */
function targetOf(parts: readonly string[], project: PythonProject): string | undefined {
  const base = join(parts);
  if (project.files.has(`${base}.py`)) return `${base}.py`;
  if (project.files.has(`${base}/__init__.py`) || project.folders.has(base)) {
    return `${base}/__init__.py`;
  }
  return undefined;
}

function join(parts: readonly string[]): string {
  return parts.filter((part) => part !== "").join("/");
}
