// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { detectProject } from "../src/detect/project";
import { jsWorkspace } from "../src/detect/units-js";
import {
  DETECTORS,
  proposedUnits,
  type UnitsDetector,
  type WorkspaceFacts,
} from "../src/detect/workspace-units";
import { tempRepo } from "./support";

/** A Cargo-like workspace whose packages bring their own test command. */
const CARGO: WorkspaceFacts = {
  packages: [
    { dir: "crates/cli", name: "cli", tests: true, uses: ["core"], command: "cargo test -p cli" },
    { dir: "crates/core", name: "core", tests: true, uses: [], command: "cargo test -p core" },
  ],
  shared: ["Cargo.toml"],
};

/** A workspace with a single package with tests, where units save nothing. */
const SINGLE: WorkspaceFacts = {
  packages: [{ dir: "lib", name: "lib", tests: true, uses: [], command: "make test" }],
  shared: [],
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The units of the proposed YAML lines, read under `verify:`. */
function unitsOf(lines: readonly string[] | undefined): unknown {
  const doc: unknown = parse(`verify:\n${(lines ?? []).join("\n")}\n`);
  return isRecord(doc) && isRecord(doc.verify) ? doc.verify.units : undefined;
}

/** A detector that records its name in `tried` and finds `facts`. */
function detector(tried: string[], name: string, facts?: WorkspaceFacts): UnitsDetector {
  return async () => {
    tried.push(name);
    return facts;
  };
}

/** The detection of a repository with no stack, so with no static checks. */
async function bare() {
  const root = await tempRepo({ "README.md": "# demo\n" });
  return { root, detection: await detectProject(root, "demo") };
}

describe("the workspace detectors of init's units", () => {
  it("AC1: tries them in order and proposes with the first that finds a workspace", async () => {
    const { root, detection } = await bare();
    const tried: string[] = [];
    const detectors = [
      detector(tried, "none"),
      detector(tried, "cargo", CARGO),
      detector(tried, "later", SINGLE),
    ];
    const lines = await proposedUnits(root, detection, "en", detectors);
    expect(tried).toEqual(["none", "cargo"]);
    expect(unitsOf(lines)).toEqual([
      { name: "core", command: "cargo test -p core", paths: ["crates/core/**", "Cargo.toml"] },
      {
        name: "cli",
        command: "cargo test -p cli",
        paths: ["crates/cli/**", "crates/core/**", "Cargo.toml"],
      },
    ]);
  });

  it("AC1: the first that finds a workspace decides, even without two packages with tests", async () => {
    const { root, detection } = await bare();
    const tried: string[] = [];
    const detectors = [detector(tried, "single", SINGLE), detector(tried, "cargo", CARGO)];
    expect(await proposedUnits(root, detection, "en", detectors)).toBeUndefined();
    expect(tried).toEqual(["single"]);
  });

  it("AC1: the pnpm, npm and yarn detector goes first", () => {
    expect(DETECTORS[0]).toBe(jsWorkspace);
  });

  it("AC1: the pnpm, npm and yarn detector leaves a melos workspace, whose packages have no package.json", async () => {
    const root = await tempRepo({
      "pubspec.yaml": "name: demo_workspace\n",
      "melos.yaml": "name: demo\npackages:\n  - packages/*\n",
      "packages/app/pubspec.yaml": "name: app\n",
      "packages/core/pubspec.yaml": "name: core\n",
    });
    const detection = await detectProject(root, "demo");
    expect(detection.packages).toEqual(["packages/app", "packages/core"]);
    expect(await jsWorkspace(root, detection)).toBeUndefined();
  });
});
