// SPDX-License-Identifier: Apache-2.0
import { join, posix } from "node:path";
import type { WorkspacePackage } from "@baquia-dev/specty-core";
import { exists, isDirectory, readText } from "../io/files";
import { rootPackagePaths } from "./root-package";
import type { WorkspaceFacts } from "./workspace-units";

/** The root files every subproject's build reads, when they exist. */
const SHARED = [
  "settings.gradle.kts",
  "settings.gradle",
  "build.gradle.kts",
  "build.gradle",
  "gradle.properties",
];

/** The root folders every subproject's build reads: the wrapper and catalog, and `buildSrc`. */
const SHARED_DIRS = ["gradle", "buildSrc"];

/** A string literal or a comment of a Kotlin or Groovy script, from left to right. */
const LEXEMES = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/** An `include` and its paths: quoted, separated by commas, with parentheses or without. */
const INCLUDE = /(?<![\w.])include(?!\w)\s*\(?\s*((?:["'][^"'\n]*["']\s*,?\s*)+)/g;

const INCLUDE_BUILD = /(?<![\w.])includeBuild\s*\(?\s*["']([^"'\n]+)["']/g;

/** The root project's name in the settings: `rootProject.name = "demo"`. */
const ROOT_NAME = /(?<![\w.])rootProject\.name\s*=\s*["']([^"'\n]+)["']/;

/** A dependency on a project by its path: `project(":a")`, `project(path: ':a')`. */
const PROJECT = /(?<![\w.])project\s*\(?\s*(?:path\s*[:=]\s*)?["'](:[^"'\n]*)["']/g;

/** A type-safe project accessor, `projects.libs.coreData`, captured from its first dot. */
const ACCESSOR = /(?<![\w.])projects((?:\.\w+)+)/g;

/** A subproject with tests or not, and its build script without comments. */
interface Subproject extends Omit<WorkspacePackage, "uses"> {
  readonly build: string;
}

/**
 * A Gradle build with subprojects: the ones `settings.gradle(.kts)` includes and that have a
 * folder, those with `src/test` tested with their `test` task, and what they share. A root project
 * with tests is one more (`rootProjectOf`). Undefined without settings and with fewer than two
 * projects with tests.
 */
export async function gradleWorkspace(root: string): Promise<WorkspaceFacts | undefined> {
  const settings = await script(root, "settings");
  if (settings === undefined) return undefined;
  const runner = (await exists(join(root, "gradlew"))) ? "./gradlew" : "gradle";
  const read = await Promise.all(
    includes(settings).map((path) => subprojectOf(root, path, runner)),
  );
  const subprojects = read.flatMap((subproject) => (subproject === undefined ? [] : [subproject]));
  const self = await rootProjectOf(root, settings, runner, subprojects);
  const found = self === undefined ? subprojects : [self, ...subprojects];
  if (found.filter((subproject) => subproject.tests).length < 2) return undefined;
  const accessors = new Map(subprojects.map(({ name }) => [accessorOf(name), name]));
  const packages = found.map(({ build, ...subproject }) => ({
    ...subproject,
    uses: usesOf(build, accessors, self?.name).filter((name) => name !== subproject.name),
  }));
  return { packages, shared: await sharedOf(root, settings) };
}

/**
 * The root project when it has tests (`src/test`): tested with its own `:test` task, named as the
 * settings' `rootProject.name` (`root` without it), and reading the root outside the subprojects'
 * folders (`rootPackagePaths`); undefined without tests.
 */
async function rootProjectOf(
  root: string,
  settings: string,
  runner: string,
  subprojects: readonly Subproject[],
): Promise<Subproject | undefined> {
  if (!(await isDirectory(join(root, "src", "test")))) return undefined;
  return {
    dir: ".",
    name: ROOT_NAME.exec(settings)?.[1] ?? "root",
    tests: true,
    command: `${runner} :test`,
    build: (await script(root, "build")) ?? "",
    paths: await rootPackagePaths(
      root,
      subprojects.map(({ dir }) => dir),
    ),
  };
}

/** The project paths of the settings' `include`s, with their leading `:`, once each. */
function includes(settings: string): readonly string[] {
  const paths = [...settings.matchAll(INCLUDE)].flatMap(([, list]) =>
    [...(list ?? "").matchAll(/["']([^"'\n]*)["']/g)].map(([, path]) => path ?? ""),
  );
  return [...new Set(paths.map((path) => (path.startsWith(":") ? path : `:${path}`)))];
}

/** The subproject at `path`, in its default folder; undefined when that folder does not exist. */
async function subprojectOf(
  root: string,
  path: string,
  runner: string,
): Promise<Subproject | undefined> {
  const parts = path.split(":").slice(1);
  const valid = parts.every(
    (part) => part !== "" && part !== "." && part !== ".." && !/[/\\]/.test(part),
  );
  const dir = parts.join("/");
  if (!valid || !(await isDirectory(join(root, dir)))) return undefined;
  return {
    dir,
    name: path,
    tests: await isDirectory(join(root, dir, "src", "test")),
    command: `${runner} ${path}:test`,
    build: (await script(join(root, dir), "build")) ?? "",
  };
}

/**
 * The paths of the subprojects a build script names, by path or by typed accessor, and the root
 * project's name, `rootName`, for `project(":")`.
 */
function usesOf(
  build: string,
  accessors: ReadonlyMap<string, string>,
  rootName: string | undefined,
): readonly string[] {
  const byPath = [...build.matchAll(PROJECT)].map(([, path]) =>
    path === ":" ? (rootName ?? "") : (path ?? ""),
  );
  const typed = [...build.matchAll(ACCESSOR)].map(([, chain]) => (chain ?? "").slice(1));
  const known = new Set([...accessors.values(), ...(rootName === undefined ? [] : [rootName])]);
  const used = [...byPath, ...typed.map((chain) => accessors.get(chain) ?? "")];
  return [...new Set(used)].filter((name) => known.has(name));
}

/** A project path's typed accessor, without `projects.`: `:libs:core-data` is `libs.coreData`. */
function accessorOf(path: string): string {
  return path
    .slice(1)
    .split(":")
    .map((part) => part.replace(/[-_]+([A-Za-z0-9])/g, (_, next: string) => next.toUpperCase()))
    .join(".");
}

/** The root files and folders that exist of the shared ones and of the settings' `includeBuild`s. */
async function sharedOf(root: string, settings: string): Promise<readonly string[]> {
  const builds = [...settings.matchAll(INCLUDE_BUILD)].flatMap(([, path]) => {
    const dir = posix.normalize((path ?? "").replaceAll("\\", "/")).replace(/\/+$/, "");
    const outside =
      dir === "." || dir === ".." || dir.startsWith("../") || /^(\/|[A-Za-z]:)/.test(dir);
    return outside ? [] : [dir];
  });
  const dirs = [...new Set([...SHARED_DIRS, ...builds])];
  const [files, folders] = await Promise.all([
    Promise.all(SHARED.map((file) => exists(join(root, file)))),
    Promise.all(dirs.map((dir) => isDirectory(join(root, dir)))),
  ]);
  return [
    ...SHARED.filter((_, at) => files[at] === true),
    ...dirs.filter((_, at) => folders[at] === true).map((dir) => `${dir}/**`),
  ];
}

/** `<base>.gradle.kts` or `<base>.gradle` in `dir`, without its comments; undefined without both. */
async function script(dir: string, base: string): Promise<string | undefined> {
  const text =
    (await readText(join(dir, `${base}.gradle.kts`))) ??
    (await readText(join(dir, `${base}.gradle`)));
  return text?.replace(LEXEMES, (lexeme) => (lexeme.startsWith("/") ? " " : lexeme));
}
