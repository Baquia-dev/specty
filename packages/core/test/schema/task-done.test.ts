// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

/** The checks `task done` always runs: the approved plan's and the approved tests'. */
const GUARANTEED = [
  "spec-approved",
  "scope",
  "dependencies",
  "fix-tests",
  "criteria-tested",
  "tests-removed",
  "tests-locked",
];

/** The issues of a configuration whose `checks.taskDone` is `taskDone`. */
const issuesOf = (taskDone: unknown) => {
  const result = resolveConfig({ version: 1, checks: { taskDone } });
  return result.ok ? [] : result.issues;
};
const pathsOf = (taskDone: unknown) => issuesOf(taskDone).map((issue) => issue.path);

describe("the checks task done leaves out", () => {
  it("AC1: are none without the key, as today", () => {
    expect(DEFAULT_CONFIG.checks.taskDone).toEqual({ skip: [] });
    for (const checks of [undefined, {}, { taskDone: {} }]) {
      expect(resolveConfig({ version: 1, checks })).toMatchObject({
        ok: true,
        config: { checks: { taskDone: { skip: [] } } },
      });
    }
  });

  it("AC3: takes the code's quality checks as written, an unknown id among them", () => {
    const skip = ["vulnerabilities", "code-rules", "focused-tests", "typecheck", "unknown-check"];
    expect(resolveConfig({ version: 1, checks: { taskDone: { skip } } })).toMatchObject({
      ok: true,
      config: { checks: { taskDone: { skip } } },
    });
  });

  it("AC3: refuses each check task done always runs, by its key, saying task done runs it", () => {
    for (const id of GUARANTEED) {
      const issues = issuesOf({ skip: ["todo", id] });
      expect(
        issues.map((issue) => issue.path),
        id,
      ).toEqual(["checks.taskDone.skip.1"]);
      expect(issues[0]?.message, id).toContain(`«${id}»`);
      expect(issues[0]?.message, id).toContain("task done");
    }
    expect(pathsOf({ skip: ["tests-locked", "secrets", "scope"] })).toEqual([
      "checks.taskDone.skip.0",
      "checks.taskDone.skip.2",
    ]);
  });

  it("AC3: refuses an empty id, a value that is not a list and an unknown key, by its key", () => {
    expect(pathsOf({ skip: ["todo", ""] })).toEqual(["checks.taskDone.skip.1"]);
    for (const skip of ["todo", 1, null, { todo: true }]) {
      expect(pathsOf({ skip }), JSON.stringify(skip)).toEqual(["checks.taskDone.skip"]);
    }
    expect(pathsOf({ run: ["todo"] })).toEqual(["checks.taskDone"]);
    expect(pathsOf(["todo"])).toEqual(["checks.taskDone"]);
  });
});
