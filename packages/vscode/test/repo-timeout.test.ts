// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import config from "../vitest.config";

describe("the time limit of the extension's tests", () => {
  it("AC1: a test that sets no limit of its own gets 30 s, not Vitest's 5 s", () => {
    // The tests start Node, which may take seconds on a busy machine.
    expect(config.test?.testTimeout).toBe(30_000);
  });
});
