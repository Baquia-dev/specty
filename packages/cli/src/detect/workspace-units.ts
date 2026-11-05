// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type Lang,
  proposeUnits,
  type UnitsFacts,
  unitsYaml,
  type WorkspacePackage,
} from "@baquia-dev/specty-core";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { Detection } from "./project";

const LOCKFILES: Readonly<Record<UnitsFacts["manager"], string>> = {
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  npm: "package-lock.json",
};

/** Where a package lists the packages it depends on. */
const DEPENDENCIES = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * The units `init` proposes for a pnpm, npm or yarn workspace, as YAML lines under `verify:`;
 * undefined when it is not one or has fewer than two packages with tests.
 */
export async function proposedUnits(
  root: string,
  detection: Detection,
  lang: Lang,
): Promise<readonly string[] | undefined> {
  if (detection.packages.length < 2) return undefined;
  const manager = await managerOf(root);
  const read = await Promise.all(detection.packages.map((dir) => manifestOf(root, dir)));
  const manifests = read.flatMap((manifest) => (manifest === undefined ? [] : [manifest]));
  const names = new Set(manifests.map((manifest) => manifest.name));
  const packages: WorkspacePackage[] = manifests.map((manifest) => ({
    ...manifest,
    uses: manifest.uses.filter((name) => names.has(name)),
  }));
  const candidates = [
    "package.json",
    LOCKFILES[manager],
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "tsconfig.base.json",
  ];
  const found = await Promise.all(candidates.map((file) => exists(join(root, file))));
  const shared = candidates.filter((_, at) => found[at] === true);
  const { lint, typecheck } = detection.commands;
  const checks = [lint, typecheck].flatMap((command) => (command === undefined ? [] : [command]));
  const units = proposeUnits({ manager, packages, shared, checks, lang });
  return units === undefined ? undefined : unitsYaml(units);
}

/** pnpm with `pnpm-workspace.yaml`, yarn with `yarn.lock`, and npm otherwise. */
async function managerOf(root: string): Promise<UnitsFacts["manager"]> {
  if (await exists(join(root, "pnpm-workspace.yaml"))) return "pnpm";
  return (await exists(join(root, "yarn.lock"))) ? "yarn" : "npm";
}

/** What a package's `package.json` says: its name, its test script and what it depends on. */
async function manifestOf(root: string, dir: string): Promise<WorkspacePackage | undefined> {
  const json = parseJson(await readText(join(root, dir, "package.json")));
  if (!isRecord(json) || typeof json.name !== "string") return undefined;
  const scripts = isRecord(json.scripts) ? json.scripts : {};
  const uses = DEPENDENCIES.flatMap((key) => {
    const listed = json[key];
    return isRecord(listed) ? Object.keys(listed) : [];
  });
  return { dir, name: json.name, tests: typeof scripts.test === "string", uses };
}
