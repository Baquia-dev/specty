// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configDefaults } from "vitest/config";
import config from "../vitest-base.config";

/** What this test reads of `angular.json`: the options of each project's `test` target. */
interface AngularJson {
  readonly projects: Readonly<
    Record<string, { readonly architect: { readonly test: { readonly options: object } } }>
  >;
}

const angular: AngularJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "angular.json"), "utf8"),
);

describe("the UI's JUnit report", () => {
  it("AC1: its tests leave it in coverage/junit.xml", () => {
    const options = angular.projects["specty-ui"]?.architect.test.options;
    // The builder loads `vitest-base.config.ts`; its own `reporters` would replace Vitest's.
    expect(options).toMatchObject({ runnerConfig: true });
    expect(options).not.toHaveProperty("reporters");
    expect(options).not.toHaveProperty("outputFile");
    // Vitest's own reporters stay: the usual one, the brief one for agents, and GitHub's annotations.
    expect(config.test?.reporters).toEqual([...configDefaults.reporters, "junit"]);
    expect(config.test?.outputFile).toEqual({ junit: "coverage/junit.xml" });
  });
});
