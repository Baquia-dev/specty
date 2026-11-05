// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import config from "../vitest.config";

describe("the extension's JUnit report", () => {
  it("AC1: its tests leave it in coverage/junit.xml", () => {
    // Vitest's own reporters stay: the usual one, the brief one for agents, and GitHub's annotations.
    expect(config.test?.reporters).toEqual([...configDefaults.reporters, "junit"]);
    expect(config.test?.outputFile).toEqual({ junit: "coverage/junit.xml" });
  });
});
