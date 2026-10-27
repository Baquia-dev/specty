// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { branchName, branchPatternIssue, branchUsesType } from "../src";

const change = {
  kind: "standard",
  type: "feat",
  id: "20261027-login-con-google",
  title: "Login con Google",
} as const;

describe("the branch of a new change", () => {
  it("is its type and title in GitHub Flow and trunk, without the date (AC1)", () => {
    expect(branchName({ ...change, flow: "github", type: "fix" })).toBe("fix/login-con-google");
    expect(branchName({ ...change, flow: "trunk" })).toBe("feat/login-con-google");
    expect(branchName({ ...change, flow: "github", type: "refactor" })).toBe(
      "refactor/login-con-google",
    );
  });

  it("uses Git Flow's prefixes: bugfix for a fix, feature for the rest (AC2)", () => {
    expect(branchName({ ...change, flow: "gitflow", type: "fix" })).toBe("bugfix/login-con-google");
    expect(branchName({ ...change, flow: "gitflow" })).toBe("feature/login-con-google");
    expect(branchName({ ...change, flow: "gitflow", type: "docs" })).toBe(
      "feature/login-con-google",
    );
  });

  it("is spike/<slug> for a spike in any flow but Specty's, whatever its type (AC2)", () => {
    for (const flow of ["github", "trunk", "gitflow"] as const) {
      expect(branchName({ ...change, flow, kind: "spike", type: "fix" })).toBe(
        "spike/login-con-google",
      );
    }
  });

  it("keeps Specty's own names, with the id, whatever the type (AC3)", () => {
    expect(branchName({ ...change, flow: "specty", type: "fix" })).toBe(
      "specty/20261027-login-con-google",
    );
    expect(branchName({ ...change, flow: "specty", kind: "spike" })).toBe(
      "spike/20261027-login-con-google",
    );
  });
});

describe("a branch pattern", () => {
  it("names the branch over the flow, with the commit type as is (AC1)", () => {
    const pattern = "team/{type}-{slug}";
    expect(branchName({ ...change, flow: "gitflow", type: "fix", pattern })).toBe(
      "team/fix-login-con-google",
    );
    expect(branchName({ ...change, flow: "specty", pattern: "JIRA/{id}" })).toBe(
      "JIRA/20261027-login-con-google",
    );
    expect(branchName({ ...change, flow: "github", kind: "spike", pattern })).toBe(
      "team/spike-login-con-google",
    );
  });

  it("is refused without {slug} or {id}, with another placeholder or as a bad branch name (AC2)", () => {
    for (const valid of ["{type}/{slug}", "users/ana/{slug}", "JIRA-{id}", "{slug}"]) {
      expect(branchPatternIssue(valid), valid).toBeUndefined();
    }
    expect(branchPatternIssue("{type}/fijo")).toContain("{slug} or {id}");
    expect(branchPatternIssue("{user}/{slug}")).toContain("{user}");
    for (const bad of [
      "mi rama/{slug}",
      "a..{slug}",
      "{slug}~1",
      "a:{slug}",
      "{slug}?",
      "a*/{slug}",
      "[x]{slug}",
      "a\\{slug}",
      "a//{slug}",
      "/{slug}",
      "{slug}/",
      "{slug}.",
      "{slug}.lock",
      "a/.{slug}",
      "a@{{slug}",
    ]) {
      expect(branchPatternIssue(bad), bad).toContain("not a valid branch name");
    }
  });

  it("decides whether the type names the branch: by {type} with a pattern, by the flow without (AC3)", () => {
    expect(branchUsesType({ flow: "github" })).toBe(true);
    expect(branchUsesType({ flow: "specty" })).toBe(false);
    expect(branchUsesType({})).toBe(false);
    expect(branchUsesType({ flow: "github", branchPattern: "users/ana/{slug}" })).toBe(false);
    expect(branchUsesType({ branchPattern: "{type}/{slug}" })).toBe(true);
  });
});
