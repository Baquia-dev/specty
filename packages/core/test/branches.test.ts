// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { branchName } from "../src";

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
