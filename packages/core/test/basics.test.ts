// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  makeChangeId,
  matchesPattern,
  moduleOf,
  normalizePath,
  parseItemId,
  pathProblem,
  slugify,
} from "../src";

describe("ids", () => {
  it("builds change ids from a date and a title", () => {
    expect(makeChangeId(new Date(2026, 9, 20), "Mi evolución académica")).toBe(
      "20261020-mi-evolucion-academica",
    );
    expect(slugify("¡Hola, Mundo!")).toBe("hola-mundo");
    expect(slugify("!!!")).toBe("change");
  });

  it("parses item ids into canonical form", () => {
    expect(parseItemId("ac01")).toEqual({ prefix: "AC", number: 1, id: "AC1" });
    expect(parseItemId("c3")?.id).toBe("C3");
    expect(parseItemId("A0")).toBeUndefined();
    expect(parseItemId("X1")).toBeUndefined();
  });
});

describe("paths", () => {
  it("normalizes paths written in specs", () => {
    expect(normalizePath("./lib\\x.dart")).toBe("lib/x.dart");
    expect(normalizePath("`a b.ts`")).toBe("a b.ts");
    expect(normalizePath("src//a.ts")).toBe("src/a.ts");
  });

  it("explains unusable paths", () => {
    expect(pathProblem("/etc/hosts")).toBe("absolute");
    expect(pathProblem("C:/x")).toBe("absolute");
    expect(pathProblem("a/../b")).toBe("parent");
    expect(pathProblem("lib/")).toBe("directory");
    expect(pathProblem("lib/a.dart")).toBeUndefined();
  });

  it("derives a module name", () => {
    expect(moduleOf("lib/features/home/x.dart")).toBe("home");
    expect(moduleOf("packages/core/src/spec/parse.ts")).toBe("core");
    expect(moduleOf("src/index.ts")).toBe("src");
    expect(moduleOf("package.json")).toBe("(root)");
  });
});

describe("glob", () => {
  it("treats parentheses literally and includes dotfiles", () => {
    expect(matchesPattern("app/(auth)/login/page.tsx", "app/(auth)/**")).toBe(true);
    expect(matchesPattern("app/(auth)/page.tsx", "app/(auth)/page.tsx")).toBe(true);
    expect(matchesPattern("config/.env.local", "**/.env*")).toBe(true);
    expect(matchesPattern("lib/a.dart", "lib/*.ts")).toBe(false);
  });
});
