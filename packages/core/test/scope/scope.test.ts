// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  autoBasis,
  type ChangedFile,
  DEFAULT_CONFIG,
  decideScopeRequest,
  evaluateTaskScope,
  isGoverned,
  isTestFile,
  isTestOf,
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

  it("allows the tests of Maven, Gradle and SwiftPM next to their code (AC1, AC2, AC3)", () => {
    const java = ["src/main/java/com/acme/app/Cart.java"];
    expect(outOfScope(java, modified("src/test/java/com/acme/app/CartTest.java"))).toEqual([]);
    const kotlin = ["app/src/main/kotlin/com/acme/app/Cart.kt"];
    expect(outOfScope(kotlin, modified("app/src/test/kotlin/com/acme/app/CartTest.kt"))).toEqual(
      [],
    );
    expect(outOfScope(java, modified("src/test/java/com/acme/other/OtherTest.java"))).toEqual([
      "src/test/java/com/acme/other/OtherTest.java",
    ]);
    const swift = ["Sources/Shop/Cart.swift"];
    expect(outOfScope(swift, modified("Tests/ShopTests/CartTests.swift"))).toEqual([]);
    expect(outOfScope(swift, modified("Tests/OtherTests/CartTests.swift"))).toEqual([
      "Tests/OtherTests/CartTests.swift",
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

describe("isTestOf", () => {
  it("takes a test right under the mirror root only for the file of its name (AC1, AC2)", () => {
    expect(isTestOf("tests/user.rs", ["src/cart.rs"])).toBe(false);
    expect(isTestOf("tests/cart.rs", ["src/cart.rs"])).toBe(true);
    expect(isTestOf("tests/test_cart.py", ["src/cart.py"])).toBe(true);
    expect(isTestOf("test/cart_test.dart", ["lib/cart.dart"])).toBe(true);
    expect(isTestOf("test/legacy_test.dart", ["lib/cart.dart"])).toBe(false);
    expect(isTestOf("packages/core/test/parse.test.ts", ["packages/core/src/parse.ts"])).toBe(true);
    const swift = ["Sources/Shop/Cart.swift"];
    expect(isTestOf("Tests/ShopTests/CartTests.swift", swift)).toBe(true);
    expect(isTestOf("Tests/ShopTests/UserTests.swift", swift)).toBe(false);
  });

  it("keeps the folder for deeper tests, tests next to the code and globs (AC3)", () => {
    expect(isTestOf("tests/domain/test_other.py", ["src/domain/user.py"])).toBe(true);
    expect(isTestOf("src/a/__tests__/c.test.ts", ["src/a/b.ts"])).toBe(true);
    expect(isTestOf("pkg/x/a_test.go", ["pkg/x/b.go"])).toBe(true);
    expect(isTestOf("tests/user.rs", ["src/**"])).toBe(true);
    expect(isTestOf("tests/user.rs", ["src/cart.rs", "src/user.rs"])).toBe(true);
    const java = ["src/main/java/com/acme/app/Cart.java"];
    expect(isTestOf("src/test/java/com/acme/app/OtherTest.java", java)).toBe(true);
    // Touching it is still within the task's scope.
    expect(outOfScope(["src/cart.rs"], modified("tests/user.rs"))).toEqual([]);
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

  it("approves what the approved spec already plans, unless it is sensitive (AC1, AC2, AC4)", () => {
    const planned = ["lib/b.dart", "lib/feature/**", "lib/auth/login.dart"];
    expect(decideScopeRequest(["lib/b.dart", "lib/feature/x.dart"], RULES, planned)).toBe("auto");
    expect(decideScopeRequest(["lib/b.dart", "lib/c.dart"], RULES, planned)).toBe("human");
    expect(decideScopeRequest(["lib/auth/login.dart"], RULES, planned)).toBe("human");
    expect(decideScopeRequest(["lib/b.dart"], { ...RULES, autoApprove: "none" }, planned)).toBe(
      "human",
    );
  });

  it("names why each path qualifies, tests and generated files first", () => {
    expect(autoBasis("test/x_test.dart", RULES, ["test/x_test.dart"])).toBe("test");
    expect(autoBasis("lib/a.g.dart", RULES, ["lib/a.g.dart"])).toBe("generated");
    expect(autoBasis("lib/b.dart", RULES, ["lib/b.dart"])).toBe("planned");
    expect(autoBasis("lib/c.dart", RULES, ["lib/b.dart"])).toBeUndefined();
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

  it("takes spec folders for tests only outside a folder of code, where RSpec puts them", () => {
    for (const path of [
      "spec/models/user_spec.rb",
      "spec/spec_helper.rb",
      "packages/billing/specs/invoice_spec.rb",
      "src/test/java/com/shop/Cart.java",
    ]) {
      expect(isTestFile(path), path).toBe(true);
    }
    for (const path of [
      "packages/core/src/spec/parse.ts",
      "lib/specs/registry.dart",
      "app/spec/builder.rb",
    ]) {
      expect(isTestFile(path), path).toBe(false);
    }
  });

  it("does not take code under src/spec for a test of the code it sits next to", () => {
    const core = ["packages/core/src/spec/parse.ts"];
    expect(outOfScope(core, modified("packages/core/src/spec/serialize.ts"))).toEqual([
      "packages/core/src/spec/serialize.ts",
    ]);
    expect(isTestOf("spec/models/user_spec.rb", ["app/models/user.rb"])).toBe(true);
  });
});
