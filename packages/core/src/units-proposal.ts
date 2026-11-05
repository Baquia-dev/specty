// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "./i18n";
import type { VerifyUnit } from "./schema/verify";

/** A package of a JavaScript or TypeScript workspace, as its `package.json` says. */
export interface WorkspacePackage {
  /** Its folder, repository-relative. */
  readonly dir: string;
  readonly name: string;
  /** Whether it has a `test` script. */
  readonly tests: boolean;
  /** The names of the workspace's packages it depends on. */
  readonly uses: readonly string[];
}

/** What `init` knows of a workspace to propose its units. */
export interface UnitsFacts {
  readonly manager: "pnpm" | "npm" | "yarn";
  readonly packages: readonly WorkspacePackage[];
  /** The root files every package's tests read: its manifest, lockfile and base configurations. */
  readonly shared: readonly string[];
  /** The static checks detected (lint, types), which read the whole repository. */
  readonly checks: readonly string[];
  readonly lang: Lang;
}

/** How each package manager runs one package's tests. */
const TESTS: Readonly<Record<UnitsFacts["manager"], (name: string) => string>> = {
  pnpm: (name) => `pnpm --filter ${name} test`,
  npm: (name) => `npm test --workspace=${name}`,
  yarn: (name) => `yarn workspace ${name} test`,
};

/**
 * The units of `verify.units` for a workspace: one with the static checks, if any, then one per
 * package with tests, from the ones that use fewer packages to the ones that use more. Undefined
 * with fewer than two packages with tests, where units save nothing.
 */
export function proposeUnits(facts: UnitsFacts): readonly VerifyUnit[] | undefined {
  const tested = facts.packages.filter((pkg) => pkg.tests);
  if (tested.length < 2) return undefined;
  const byName = new Map(facts.packages.map((pkg) => [pkg.name, pkg]));
  const names = unitNames(tested);
  const packages = tested
    .map((pkg) => ({ pkg, uses: usedFolders(pkg, byName) }))
    .toSorted((a, b) => a.uses.length - b.uses.length || a.pkg.dir.localeCompare(b.pkg.dir))
    .map(({ pkg, uses }) => ({
      name: names.get(pkg.dir) ?? pkg.dir,
      command: TESTS[facts.manager](pkg.name),
      paths: [`${pkg.dir}/**`, ...uses.map((dir) => `${dir}/**`), ...facts.shared],
    }));
  if (facts.checks.length === 0) return packages;
  const name = facts.lang === "es" ? "estático" : "static";
  return [{ name, command: facts.checks.join(" && "), paths: ["**"] }, ...packages];
}

/** The folders of the workspace's packages `pkg` depends on, directly or not, sorted. */
function usedFolders(
  pkg: WorkspacePackage,
  byName: ReadonlyMap<string, WorkspacePackage>,
): readonly string[] {
  const seen = new Set<string>();
  const pending = [...pkg.uses];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const used = byName.get(name);
    if (used === undefined || used.dir === pkg.dir || seen.has(used.dir)) continue;
    seen.add(used.dir);
    pending.push(...used.uses);
  }
  return [...seen].toSorted();
}

/** Each package's unit name: the last part of its folder, or the whole folder if two share it. */
function unitNames(packages: readonly WorkspacePackage[]): ReadonlyMap<string, string> {
  const last = (dir: string) => dir.slice(dir.lastIndexOf("/") + 1);
  const count = new Map<string, number>();
  for (const pkg of packages) count.set(last(pkg.dir), (count.get(last(pkg.dir)) ?? 0) + 1);
  return new Map(
    packages.map((pkg) => [pkg.dir, count.get(last(pkg.dir)) === 1 ? last(pkg.dir) : pkg.dir]),
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
