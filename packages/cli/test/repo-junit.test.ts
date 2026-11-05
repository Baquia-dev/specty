// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";

/** The root of this repository. */
const ROOT = join(import.meta.dirname, "..", "..", "..");

/** The packages whose tests leave a JUnit report, for `checks.testTime` to read. */
const PACKAGES = ["packages/core", "packages/exporters", "packages/cli"];

/** What these tests read of a package's `vitest.config.ts`. */
interface VitestConfig {
  readonly default: {
    readonly test?: { readonly reporters?: unknown; readonly outputFile?: unknown };
  };
}

describe("this repository's JUnit reports", () => {
  it.each(PACKAGES)("AC1: %s's tests leave theirs in coverage/junit.xml", async (folder) => {
    const config: VitestConfig = await import(join(ROOT, folder, "vitest.config.ts"));
    // Vitest's own reporters stay: the usual one, the brief one for agents, and GitHub's annotations.
    expect(config.default.test?.reporters).toEqual([...configDefaults.reporters, "junit"]);
    expect(config.default.test?.outputFile).toEqual({ junit: "coverage/junit.xml" });
  });
});
