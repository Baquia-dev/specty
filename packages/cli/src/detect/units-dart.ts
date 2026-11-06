// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import type { WorkspacePackage } from "@baquia-dev/specty-core";
import { exists, isDirectory, isRecord, readText } from "../io/files";
import { expand, safeYaml } from "./project";
import { rootPackagePaths } from "./root-package";
import type { WorkspaceFacts } from "./workspace-units";

type Mapping = Readonly<Record<string, unknown>>;

/** The root files every package's tests read, when they exist. */
const SHARED = ["pubspec.yaml", "pubspec.lock", "melos.yaml"];

/**
 * A pub or melos workspace: the folders of the root `pubspec.yaml`'s `workspace` and of
 * `melos.yaml`'s `packages`, minus its `ignore`, with a named `pubspec.yaml`, each tested in its
 * folder with `flutter test` or `dart test` when it has a `test` folder, and the root files they
 * share. A root with tests is one more package, tested with `flutter test` or `dart test` in the
 * root, which runs only its own `test` folder, and reading the root outside the packages' folders
 * (`rootPackagePaths`). Undefined without either list, with fewer than two packages, and when the
 * root has tests but no `name`, whose tests no unit would run.
 */
export async function dartWorkspace(root: string): Promise<WorkspaceFacts | undefined> {
  const [pubspec, melos] = await Promise.all([
    yamlAt(root, "pubspec.yaml"),
    yamlAt(root, "melos.yaml"),
  ]);
  const listed = [...strings(pubspec?.workspace), ...strings(melos?.packages)];
  if (listed.length === 0) return undefined;
  const dirs = await packageDirs(root, listed, strings(melos?.ignore));
  const read = await Promise.all(dirs.map((dir) => packageOf(root, dir)));
  const members = read.flatMap((pkg) => (pkg === undefined ? [] : [pkg]));
  const tested = await isDirectory(join(root, "test"));
  const self = tested ? await packageOf(root, ".") : undefined;
  if (tested && self === undefined) return undefined;
  const found =
    self === undefined
      ? members
      : [
          {
            ...self,
            paths: await rootPackagePaths(
              root,
              members.map(({ dir }) => dir),
            ),
          },
          ...members,
        ];
  if (found.length < 2) return undefined;
  const names = new Set(found.map((pkg) => pkg.name));
  const packages = found.map((pkg) => ({
    ...pkg,
    uses: pkg.uses.filter((name) => names.has(name)),
  }));
  const present = await Promise.all(SHARED.map((file) => exists(join(root, file))));
  return { packages, shared: SHARED.filter((_, at) => present[at] === true) };
}

/**
 * The folders of `listed`, with their globs expanded, minus those of `ignore`, the root and the
 * ones outside the repository, sorted.
 */
async function packageDirs(
  root: string,
  listed: readonly string[],
  ignore: readonly string[],
): Promise<readonly string[]> {
  const globs = (patterns: readonly string[]) =>
    Promise.all(patterns.map((pattern) => expand(root, pattern)));
  const [dirs, ignored] = await Promise.all([globs(listed), globs(ignore)]);
  const outside = new Set(ignored.flat());
  return [...new Set(dirs.flat())]
    .filter((dir) => dir !== "." && !dir.startsWith("..") && !outside.has(dir))
    .toSorted();
}

/**
 * The package in `dir`, as its `pubspec.yaml` says: its name, whether it has a `test` folder, the
 * command that runs its tests in its folder and what it depends on; undefined without a `name`.
 */
async function packageOf(root: string, dir: string): Promise<WorkspacePackage | undefined> {
  const pubspec = await yamlAt(join(root, dir), "pubspec.yaml");
  if (pubspec === undefined || typeof pubspec.name !== "string") return undefined;
  const dependencies = mapping(pubspec.dependencies);
  // Flutter as the stack decides it: the `flutter` section or the `flutter` dependency.
  const tool = "flutter" in pubspec || "flutter" in dependencies ? "flutter" : "dart";
  return {
    dir,
    name: pubspec.name,
    tests: await isDirectory(join(root, dir, "test")),
    // A subshell, so the `cd` does not reach the next unit when they run joined with `&&`.
    command: dir === "." ? `${tool} test` : `(cd ${dir} && ${tool} test)`,
    uses: [...Object.keys(dependencies), ...Object.keys(mapping(pubspec.dev_dependencies))],
  };
}

/** The YAML mapping of `file` in `dir`; undefined when it is missing, cannot be read or is not one. */
async function yamlAt(dir: string, file: string): Promise<Mapping | undefined> {
  const doc = safeYaml(await readText(join(dir, file)));
  return isRecord(doc) ? doc : undefined;
}

function mapping(value: unknown): Mapping {
  return isRecord(value) ? value : {};
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
