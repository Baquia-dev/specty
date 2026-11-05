// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { testEnv } from "./support";

describe("the temporary folder of the tests", () => {
  it("AC1: the CLI's tests and the processes they start use a folder of the run", () => {
    expect(basename(tmpdir())).toMatch(/^specty-tests-\d+-/);
    const child = execFileSync(process.execPath, ["-p", "require('node:os').tmpdir()"], {
      env: testEnv(),
      encoding: "utf8",
    });
    expect(child.trim()).toBe(tmpdir());
  });
});
