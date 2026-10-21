// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type ChangedFile,
  DEFAULT_CONFIG,
  decideScopeRequest,
  evaluateTaskScope,
  isGoverned,
  isTestFile,
  type ScopeRules,
  scopeRulesFrom,
} from "../../src";

const RULES: ScopeRules = { ...scopeRulesFrom(DEFAULT_CONFIG), generated: ["**/*.g.dart"] };

const modified = (...paths: string[]): ChangedFile[] =>
  paths.map((path) => ({ path, status: "modified" }));

function outOfScope(
  taskFiles: string[],
  changed: ChangedFile[],
  rules = RULES,
  extras: string[] = [],
) {
  return evaluateTaskScope({ changed, taskFiles, extras, rules }).outOfScope;
}

describe("evaluateTaskScope", () => {
  it("allows declared files and globs", () => {
    expect(
      outOfScope(["lib/a.dart", "lib/ui/**"], modified("lib/a.dart", "lib/ui/x/y.dart")),
    ).toEqual([]);
    expect(outOfScope(["lib/a.dart"], modified("lib/b.dart"))).toEqual(["lib/b.dart"]);
  });

  it("allows tests next to or mirroring the scope", () => {
    const flutter = ["lib/features/analytics/card.dart"];
    expect(outOfScope(flutter, modified("test/features/analytics/card_test.dart"))).toEqual([]);
    expect(
      outOfScope(["src/a/b.ts"], modified("src/a/b.test.ts", "src/a/__tests__/c.test.ts")),
    ).toEqual([]);
    expect(
      outOfScope(["src/a/b.ts"], modified("src/a/__tests__/__snapshots__/b.test.ts.snap")),
    ).toEqual([]);
    expect(outOfScope(["pkg/x/a.go"], modified("pkg/x/a_test.go"))).toEqual([]);
    expect(outOfScope(flutter, modified("test/features/home/other_test.dart"))).toEqual([
      "test/features/home/other_test.dart",
    ]);
  });

  it("allows tests mirroring the scope inside a monorepo package (AC1)", () => {
    const core = ["packages/core/src/spec/parse.ts"];
    expect(outOfScope(core, modified("packages/core/test/spec/parse.test.ts"))).toEqual([]);
    expect(
      outOfScope(["packages/web/lib/a/b.dart"], modified("packages/web/test/a/b_test.dart")),
    ).toEqual([]);
    expect(
      outOfScope(["packages/core/src/**"], modified("packages/core/test/guard/x.test.ts")),
    ).toEqual([]);
    expect(outOfScope(core, modified("packages/cli/test/spec/parse.test.ts"))).toEqual([
      "packages/cli/test/spec/parse.test.ts",
    ]);
    expect(outOfScope(core, modified("packages/core/test/flow/machine.test.ts"))).toEqual([
      "packages/core/test/flow/machine.test.ts",
    ]);
  });

  it("can disable implicit tests", () => {
    const rules = { ...RULES, implicitTests: false };
    expect(outOfScope(["src/a/b.ts"], modified("src/a/b.test.ts"), rules)).toEqual([
      "src/a/b.test.ts",
    ]);
  });

  it("allows generated files and lockfiles of manifests in scope", () => {
    expect(outOfScope(["lib/a.dart"], modified("lib/a.g.dart"))).toEqual([]);
    expect(outOfScope(["packages/web/package.json"], modified("pnpm-lock.yaml"))).toEqual([]);
    expect(outOfScope(["pubspec.yaml"], modified("pubspec.lock"))).toEqual([]);
    expect(outOfScope(["lib/a.dart"], modified("pnpm-lock.yaml"))).toEqual(["pnpm-lock.yaml"]);
  });

  it("checks both sides of a rename and approved extensions", () => {
    const rename: ChangedFile[] = [
      { path: "lib/new.dart", from: "lib/old.dart", status: "renamed" },
    ];
    expect(outOfScope(["lib/new.dart"], rename)).toEqual(["lib/old.dart"]);
    expect(outOfScope(["lib/new.dart"], rename, RULES, ["lib/old.dart"])).toEqual([]);
  });
});

describe("decideScopeRequest", () => {
  it("approves tests and generated files outside sensitive paths", () => {
    expect(decideScopeRequest(["test/x_test.dart", "lib/a.g.dart"], RULES)).toBe("auto");
    expect(decideScopeRequest(["test/auth/login_test.dart"], RULES)).toBe("human");
    expect(decideScopeRequest(["lib/a.dart"], RULES)).toBe("human");
    expect(decideScopeRequest([], RULES)).toBe("human");
    expect(decideScopeRequest(["test/x_test.dart"], { ...RULES, autoApprove: "none" })).toBe(
      "human",
    );
  });
});

describe("governed paths", () => {
  it("never governs .specty and respects ignored paths", () => {
    expect(isGoverned(".specty/changes/x/spec.md", DEFAULT_CONFIG)).toBe(false);
    expect(isGoverned("README.md", DEFAULT_CONFIG)).toBe(false);
    expect(isGoverned("lib/main.dart", DEFAULT_CONFIG)).toBe(true);
    expect(isGoverned("lib/main.dart", { governed: ["src/**"], ignored: [] })).toBe(false);
  });

  it("recognizes test files across stacks", () => {
    for (const path of [
      "a.test.ts",
      "a.spec.js",
      "a_test.dart",
      "tests/test_a.py",
      "ATest.java",
      "x/__tests__/a.ts",
    ]) {
      expect(isTestFile(path), path).toBe(true);
    }
    expect(isTestFile("lib/contest.dart")).toBe(false);
  });
});
