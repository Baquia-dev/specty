// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "./i18n";
import type { VerifyUnit } from "./schema/verify";

/** A package of a workspace, as its manifest says. */
export interface WorkspacePackage {
  /** Its folder, repository-relative. */
  readonly dir: string;
  readonly name: string;
  /** Whether it has tests: a `test` script, in JavaScript. */
  readonly tests: boolean;
  /** The command that runs its tests, when the workspace's manager does not give it. */
  readonly command?: string;
  /** The names of the workspace's packages it depends on. */
  readonly uses: readonly string[];
  /**
   * What it reads, as globs, when its folder is not only its own, such as a workspace root that
   * is a package too (`dir` `.`); without them, its whole folder.
   */
  readonly paths?: readonly string[];
}

/** What `init` knows of a workspace to propose its units. */
export interface UnitsFacts {
  /** The JavaScript package manager, which runs the tests of the packages without a `command`. */
  readonly manager?: "pnpm" | "npm" | "yarn";
  readonly packages: readonly WorkspacePackage[];
  /** The root files every package's tests read: its manifest, lockfile and base configurations. */
  readonly shared: readonly string[];
  /** The static checks detected (lint, types), which read the whole repository. */
  readonly checks: readonly string[];
  readonly lang: Lang;
}

/** How each package manager runs one package's tests. */
const TESTS: Readonly<Record<NonNullable<UnitsFacts["manager"]>, (name: string) => string>> = {
  pnpm: (name) => `pnpm --filter ${name} test`,
  npm: (name) => `npm test --workspace=${name}`,
  yarn: (name) => `yarn workspace ${name} test`,
};

/**
 * The units of `verify.units` for a workspace: one with the static checks, if any, then one per
 * package with tests, from the ones that use fewer packages to the ones that use more. Each runs
 * its package's own command or, without one, the manager's, and reads what its package and the
 * ones it uses read, then the shared files, each path once. Undefined with fewer than two packages
 * with tests and a command, where units save nothing.
 */
export function proposeUnits(facts: UnitsFacts): readonly VerifyUnit[] | undefined {
  const tested = facts.packages.flatMap((pkg) => {
    const command = testCommand(pkg, facts.manager);
    return command === undefined ? [] : [{ pkg, command }];
  });
  if (tested.length < 2) return undefined;
  const byName = new Map(facts.packages.map((pkg) => [pkg.name, pkg]));
  const names = unitNames(tested.map(({ pkg }) => pkg));
  const packages = tested
    .map((entry) => ({ ...entry, uses: usedPackages(entry.pkg, byName) }))
    .toSorted((a, b) => a.uses.length - b.uses.length || a.pkg.dir.localeCompare(b.pkg.dir))
    .map(({ pkg, command, uses }) => ({
      name: names.get(pkg.dir) ?? pkg.dir,
      command,
      paths: [...new Set([...[pkg, ...uses].flatMap(readsOf), ...facts.shared])],
    }));
  if (facts.checks.length === 0) return packages;
  const name = facts.lang === "es" ? "estático" : "static";
  return [{ name, command: facts.checks.join(" && "), paths: ["**"] }, ...packages];
}

/** The command that runs `pkg`'s tests: its own or the manager's; undefined without tests. */
function testCommand(pkg: WorkspacePackage, manager: UnitsFacts["manager"]): string | undefined {
  if (!pkg.tests) return undefined;
  return pkg.command ?? (manager === undefined ? undefined : TESTS[manager](pkg.name));
}

/** The workspace's packages `pkg` depends on, directly or not, by folder. */
function usedPackages(
  pkg: WorkspacePackage,
  byName: ReadonlyMap<string, WorkspacePackage>,
): readonly WorkspacePackage[] {
  const seen = new Map<string, WorkspacePackage>();
  const pending = [...pkg.uses];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const used = byName.get(name);
    if (used === undefined || used.dir === pkg.dir || seen.has(used.dir)) continue;
    seen.set(used.dir, used);
    pending.push(...used.uses);
  }
  return [...seen.values()].toSorted((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/** What a package reads: its own paths, or its whole folder. */
function readsOf(pkg: WorkspacePackage): readonly string[] {
  return pkg.paths ?? [`${pkg.dir}/**`];
}

/**
 * Each package's unit name: the last part of its folder, or the whole folder if two share it; the
 * package's name for the one in the root, whose folder has none.
 */
function unitNames(packages: readonly WorkspacePackage[]): ReadonlyMap<string, string> {
  const last = (pkg: WorkspacePackage) =>
    pkg.dir === "." ? pkg.name : pkg.dir.slice(pkg.dir.lastIndexOf("/") + 1);
  const count = new Map<string, number>();
  for (const pkg of packages) count.set(last(pkg), (count.get(last(pkg)) ?? 0) + 1);
  return new Map(
    packages.map((pkg) => [pkg.dir, count.get(last(pkg)) === 1 ? last(pkg) : pkg.dir]),
  );
}

/** `units` as the lines of `units:` under `verify:` in `.specty/config.yaml`. */
export function unitsYaml(units: readonly VerifyUnit[]): readonly string[] {
  return [
    "  units:",
    ...units.flatMap((unit) => [
      `    - name: ${JSON.stringify(unit.name)}`,
      `      command: ${JSON.stringify(unit.command)}`,
      `      paths: ${JSON.stringify(unit.paths)}`,
    ]),
  ];
}
