// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { basename } from "node:path";

describe("the temporary folder of the tests", () => {
  it("AC1: the UI's tests use a folder of the run", () => {
    expect(basename(tmpdir())).toMatch(/^specty-tests-\d+-/);
  });
});
