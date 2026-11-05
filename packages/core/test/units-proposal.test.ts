// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { proposeUnits, type UnitsFacts, unitsYaml } from "../src";

const SHARED = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"];

/** A pnpm workspace: core, exporters on core, cli on exporters (and so on core), docs without tests. */
const WORKSPACE: UnitsFacts = {
  manager: "pnpm",
  packages: [
    { dir: "packages/cli", name: "@demo/cli", tests: true, uses: ["@demo/exporters"] },
    { dir: "packages/core", name: "@demo/core", tests: true, uses: [] },
    { dir: "packages/exporters", name: "@demo/exporters", tests: true, uses: ["@demo/core"] },
    { dir: "docs-site", name: "docs-site", tests: false, uses: ["@demo/core"] },
  ],
  shared: SHARED,
  checks: ["pnpm lint", "pnpm typecheck"],
  lang: "es",
};

describe("the units proposed for a workspace", () => {
  it("AC1: a static one with the checks, then one per package with tests, by how many packages it uses", () => {
    expect(proposeUnits(WORKSPACE)).toEqual([
      { name: "estático", command: "pnpm lint && pnpm typecheck", paths: ["**"] },
      {
        name: "core",
        command: "pnpm --filter @demo/core test",
        paths: ["packages/core/**", ...SHARED],
      },
      {
        name: "exporters",
        command: "pnpm --filter @demo/exporters test",
        paths: ["packages/exporters/**", "packages/core/**", ...SHARED],
      },
      {
        name: "cli",
        command: "pnpm --filter @demo/cli test",
        paths: ["packages/cli/**", "packages/core/**", "packages/exporters/**", ...SHARED],
      },
    ]);
  });

  it("AC1: runs each package's tests as npm and yarn do, and names the static unit in English", () => {
    const npm = proposeUnits({ ...WORKSPACE, manager: "npm", lang: "en" });
    expect(npm?.map((unit) => unit.command)).toEqual([
      "pnpm lint && pnpm typecheck",
      "npm test --workspace=@demo/core",
      "npm test --workspace=@demo/exporters",
      "npm test --workspace=@demo/cli",
    ]);
    expect(npm?.[0]?.name).toBe("static");
    const yarn = proposeUnits({ ...WORKSPACE, manager: "yarn" });
    expect(yarn?.[1]?.command).toBe("yarn workspace @demo/core test");
  });

  it("AC1: without checks there is no static unit, and two packages with the same last folder keep their whole folder", () => {
    const units = proposeUnits({
      ...WORKSPACE,
      checks: [],
      packages: [
        { dir: "apps/web/utils", name: "web-utils", tests: true, uses: [] },
        { dir: "libs/utils", name: "lib-utils", tests: true, uses: [] },
      ],
    });
    expect(units?.map((unit) => unit.name)).toEqual(["apps/web/utils", "libs/utils"]);
  });

  it("AC1: with fewer than two packages with tests there is nothing to propose", () => {
    const one = WORKSPACE.packages.filter(
      (pkg) => pkg.dir !== "packages/cli" && pkg.dir !== "packages/exporters",
    );
    expect(proposeUnits({ ...WORKSPACE, packages: one })).toBeUndefined();
  });

  it("AC4: its YAML, under verify:, is the list of units", () => {
    const units = proposeUnits(WORKSPACE) ?? [];
    const lines = unitsYaml(units);
    expect(lines[0]).toBe("  units:");
    expect(parse(`verify:\n${lines.join("\n")}\n`)).toEqual({ verify: { units } });
  });
});
