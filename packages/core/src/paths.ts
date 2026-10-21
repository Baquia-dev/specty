// SPDX-License-Identifier: Apache-2.0

/** Generic directory names that do not identify a module on their own. */
const CONTAINER_SEGMENTS: ReadonlySet<string> = new Set([
  "src",
  "lib",
  "app",
  "apps",
  "packages",
  "pkg",
  "cmd",
  "internal",
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "features",
  "modules",
  "components",
]);

export type PathProblem = "empty" | "absolute" | "parent" | "directory";

/** Converts a path written in a spec to its canonical POSIX form. */
export function normalizePath(input: string): string {
  return stripBackticks(input.trim())
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(?:\.\/)+/, "");
}

/** Reports why a normalized path cannot be used in a spec, if it cannot. */
export function pathProblem(path: string): PathProblem | undefined {
  if (path.length === 0) return "empty";
  if (path.startsWith("/") || path.startsWith("~") || /^[A-Za-z]:/.test(path)) return "absolute";
  if (path.split("/").includes("..")) return "parent";
  if (path.endsWith("/")) return "directory";
  return undefined;
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** True when `dir` is `ancestor` or lives below it. The empty string is the repository root. */
export function isWithin(dir: string, ancestor: string): boolean {
  return ancestor === "" || dir === ancestor || dir.startsWith(`${ancestor}/`);
}

/**
 * Heuristic module of a path: the first directory after generic containers.
 * `lib/features/home/x.dart` → `home`; `src/index.ts` → `src`; `package.json` → `(root)`.
 */
export function moduleOf(path: string): string {
  const directories = path.split("/").slice(0, -1);
  const meaningful = directories.find((segment) => !CONTAINER_SEGMENTS.has(segment));
  if (meaningful !== undefined) return meaningful;
  return directories.length > 0 ? directories.join("/") : "(root)";
}

function stripBackticks(text: string): string {
  return text.length >= 2 && text.startsWith("`") && text.endsWith("`")
    ? text.slice(1, -1).trim()
    : text;
}
