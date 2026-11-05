// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

describe("the temporary folder of the tests", () => {
  it("AC1: exporters' tests use a folder of the run", () => {
    expect(basename(tmpdir())).toMatch(/^specty-tests-\d+-/);
  });
});
