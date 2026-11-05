// SPDX-License-Identifier: Apache-2.0
import { type Lang, proposeUnits, type UnitsFacts, unitsYaml } from "@baquia-dev/specty-core";
import type { Detection } from "./project";
import { cargoWorkspace } from "./units-cargo";
import { dartWorkspace } from "./units-dart";
import { goWorkspace } from "./units-go";
import { gradleWorkspace } from "./units-gradle";
import { jsWorkspace } from "./units-js";
import { uvWorkspace } from "./units-uv";

/** What a detector knows of its workspace: its packages, its manager if any and the shared root files. */
export type WorkspaceFacts = Omit<UnitsFacts, "checks" | "lang">;

/** Reads one kind of workspace from the repository; undefined when it is not one. */
export type UnitsDetector = (
  root: string,
  detection: Detection,
) => Promise<WorkspaceFacts | undefined>;

/**
 * The detectors `init` tries, in order: pnpm, npm and yarn first, then Cargo, `go.work`, uv,
 * Gradle and pub or melos.
 */
export const DETECTORS: readonly UnitsDetector[] = [
  jsWorkspace,
  cargoWorkspace,
  goWorkspace,
  uvWorkspace,
  gradleWorkspace,
  dartWorkspace,
];

/**
 * The units `init` proposes for the repository's workspace, as YAML lines under `verify:`, with
 * the first of `detectors` that finds one; undefined when none does, or when it has fewer than two
 * packages with tests.
 */
export async function proposedUnits(
  root: string,
  detection: Detection,
  lang: Lang,
  detectors: readonly UnitsDetector[] = DETECTORS,
): Promise<readonly string[] | undefined> {
  const facts = await firstWorkspace(root, detection, detectors);
  if (facts === undefined) return undefined;
  const { lint, typecheck } = detection.commands;
  const checks = [lint, typecheck].flatMap((command) => (command === undefined ? [] : [command]));
  const units = proposeUnits({ ...facts, checks, lang });
  return units === undefined ? undefined : unitsYaml(units);
}

/** The workspace of the first detector that finds one, trying them one after another. */
async function firstWorkspace(
  root: string,
  detection: Detection,
  detectors: readonly UnitsDetector[],
): Promise<WorkspaceFacts | undefined> {
  for (const detect of detectors) {
    const facts = await detect(root, detection);
    if (facts !== undefined) return facts;
  }
  return undefined;
}
