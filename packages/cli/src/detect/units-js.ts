// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import type { UnitsFacts, WorkspacePackage } from "@baquia-dev/specty-core";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { Detection } from "./project";
import type { WorkspaceFacts } from "./workspace-units";

type Manager = NonNullable<UnitsFacts["manager"]>;

const LOCKFILES: Readonly<Record<Manager, string>> = {
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
 * A pnpm, npm or yarn workspace: the detected packages with a named `package.json`, its manager
 * and the root files they share. Undefined with fewer than two such packages, as in a melos
 * workspace, whose packages are detected too.
 */
export async function jsWorkspace(
  root: string,
  detection: Detection,
): Promise<WorkspaceFacts | undefined> {
  const read = await Promise.all(detection.packages.map((dir) => manifestOf(root, dir)));
  const manifests = read.flatMap((manifest) => (manifest === undefined ? [] : [manifest]));
  if (manifests.length < 2) return undefined;
  const manager = await managerOf(root);
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
  return { manager, packages, shared };
}

/** pnpm with `pnpm-workspace.yaml`, yarn with `yarn.lock`, and npm otherwise. */
async function managerOf(root: string): Promise<Manager> {
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
