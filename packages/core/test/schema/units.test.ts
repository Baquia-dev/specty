// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../src";

const CORE = { name: "core", command: "pnpm --filter core test", paths: ["packages/core/**"] };
const CLI = {
  name: "cli",
  command: "pnpm --filter cli test",
  paths: ["packages/cli/**", "packages/core/**"],
};

/** The issues of a configuration with `units` under `verify`, or none when it is valid. */
const issuesOf = (units: unknown): readonly string[] => {
  const result = resolveConfig({ version: 1, verify: { full: "pnpm check", units } });
  return result.ok ? [] : result.issues.map(({ path, message }) => `${path}: ${message}`);
};

describe("the units of the full verification in the configuration", () => {
  it("AC1: keeps each unit with its name, command and paths, in order", () => {
    const result = resolveConfig({ version: 1, verify: { units: [CORE, CLI] } });
    expect(result.ok ? result.config.verify.units : undefined).toEqual([CORE, CLI]);
  });

  it("AC1: has none unless told", () => {
    const result = resolveConfig({ version: 1, verify: { full: "pnpm check" } });
    expect(result.ok ? result.config.verify : undefined).toEqual({
      full: "pnpm check",
      timeoutSec: 600,
      slots: 2,
      processes: { env: [], memoryMiB: 512 },
    });
  });

  it("AC1: needs a name that no other unit has", () => {
    const issues = issuesOf([CORE, { ...CLI, name: "core" }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^verify\.units\.1\.name: /);
    expect(issues[0]).toContain("core");
  });

  it("AC1: needs a command and some paths, none of them empty, and at least one unit", () => {
    expect(issuesOf([{ ...CORE, command: "" }])).toEqual([
      expect.stringMatching(/^verify\.units\.0\.command: /),
    ]);
    expect(issuesOf([{ name: "core", paths: ["packages/core/**"] }])).toEqual([
      expect.stringMatching(/^verify\.units\.0\.command: /),
    ]);
    expect(issuesOf([{ ...CORE, paths: [] }])).toEqual([
      expect.stringMatching(/^verify\.units\.0\.paths: /),
    ]);
    expect(issuesOf([{ ...CORE, paths: [""] }])).toEqual([
      expect.stringMatching(/^verify\.units\.0\.paths\.0: /),
    ]);
    expect(issuesOf([{ ...CORE, name: "" }])).toEqual([
      expect.stringMatching(/^verify\.units\.0\.name: /),
    ]);
    expect(issuesOf([])).toEqual([expect.stringMatching(/^verify\.units: /)]);
  });
});
