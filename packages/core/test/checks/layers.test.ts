// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type Layers, layerOf, layerViolations, packageName, resolveConfig } from "../../src";

const LAYERS: Layers = {
  domain: { paths: ["src/domain/**"], may: [], forbiddenPackages: ["@angular/*", "node:*"] },
  application: { paths: ["src/application/**"], may: ["domain"], forbiddenPackages: [] },
  infrastructure: {
    paths: ["src/infrastructure/**", "src/db/**"],
    may: ["application", "domain"],
    forbiddenPackages: [],
  },
};

describe("layerViolations", () => {
  it("finds each import that crosses into a layer the importer may not use", () => {
    const imports = [
      { from: "src/domain/user.ts", specifier: "../db/users", target: "src/db/users.ts" },
      { from: "src/domain/user.ts", specifier: "./email", target: "src/domain/email.ts" },
      {
        from: "src/application/sign-up.ts",
        specifier: "../domain/user",
        target: "src/domain/user.ts",
      },
      {
        from: "src/application/sign-up.ts",
        specifier: "@infra/mailer",
        target: "src/infrastructure/mailer.ts",
      },
      {
        from: "src/infrastructure/mailer.ts",
        specifier: "../domain/user",
        target: "src/domain/user.ts",
      },
      { from: "src/domain/user.ts", specifier: "../shared/ids", target: "src/shared/ids.ts" },
      { from: "src/main.ts", specifier: "./db/users", target: "src/db/users.ts" },
    ];
    expect(layerViolations(imports, LAYERS)).toEqual([
      {
        from: "src/domain/user.ts",
        specifier: "../db/users",
        layer: "domain",
        target: { layer: "infrastructure", path: "src/db/users.ts" },
      },
      {
        from: "src/application/sign-up.ts",
        specifier: "@infra/mailer",
        layer: "application",
        target: { layer: "infrastructure", path: "src/infrastructure/mailer.ts" },
      },
    ]);
  });

  it("finds each package a layer may not import", () => {
    const imports = [
      { from: "src/domain/user.ts", specifier: "@angular/core", package: "@angular/core" },
      { from: "src/domain/user.ts", specifier: "zod", package: "zod" },
      { from: "src/domain/user.ts", specifier: "fs", package: "node:fs" },
      { from: "src/application/sign-up.ts", specifier: "@angular/core", package: "@angular/core" },
    ];
    expect(layerViolations(imports, LAYERS)).toEqual([
      {
        from: "src/domain/user.ts",
        specifier: "@angular/core",
        layer: "domain",
        target: { package: "@angular/core" },
      },
      {
        from: "src/domain/user.ts",
        specifier: "fs",
        layer: "domain",
        target: { package: "node:fs" },
      },
    ]);
  });

  it("puts a file in the first layer whose paths contain it", () => {
    expect(layerOf("src/db/users.ts", LAYERS)).toBe("infrastructure");
    expect(layerOf("src/main.ts", LAYERS)).toBeUndefined();
    expect(
      layerOf("src/domain/a.ts", {
        ...LAYERS,
        other: { paths: ["src/**"], may: [], forbiddenPackages: [] },
      }),
    ).toBe("domain");
  });
});

describe("packageName", () => {
  it("names the package of a specifier, scoped or not, and Node's own modules", () => {
    expect(packageName("@angular/core/testing")).toBe("@angular/core");
    expect(packageName("@angular/core")).toBe("@angular/core");
    expect(packageName("lodash/fp")).toBe("lodash");
    expect(packageName("zod")).toBe("zod");
    expect(packageName("node:fs/promises")).toBe("node:fs");
  });
});

describe("checks.layers", () => {
  it("reads the layers, with their defaults, and refuses a may that names no layer", () => {
    const result = resolveConfig({
      version: 1,
      checks: { layers: { domain: { paths: ["src/domain/**"] } } },
    });
    expect(result.ok && result.config.checks.layers).toEqual({
      domain: { paths: ["src/domain/**"], may: [], forbiddenPackages: [] },
    });
    const wrong = resolveConfig({
      version: 1,
      checks: { layers: { domain: { paths: ["src/domain/**"], may: ["core"] } } },
    });
    expect(wrong).toMatchObject({ ok: false, issues: [{ path: "checks.layers.domain.may" }] });
    expect(resolveConfig({ version: 1 }).ok && resolveConfig({ version: 1 })).toMatchObject({
      config: { checks: { layers: {} } },
    });
  });
});
