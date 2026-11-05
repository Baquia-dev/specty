// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, inject, it } from "vitest";

describe("the temporary folder of the evals", () => {
  it("AC1: their tests and the processes they start use a folder of the run", () => {
    expect(basename(tmpdir())).toMatch(/^specty-tests-\d+-/);
    const child = execFileSync(process.execPath, ["-p", "require('node:os').tmpdir()"], {
      encoding: "utf8",
    });
    expect(child.trim()).toBe(tmpdir());
  });

  it("AC2: the suite's report goes to the system's temporary folder, outside the run's", () => {
    expect(inject("reports")).toBe(join(dirname(tmpdir()), "specty-evals"));
  });
});
