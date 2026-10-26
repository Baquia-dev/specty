// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type Case,
  type Example,
  expected,
  generatorScript,
  githubToken,
  hasSecretScanner,
  MARK,
  rendered,
  repeat,
  SPEC_FILE,
  statuses,
  toolScript,
} from "./stack-examples";

/**
 * An Angular and a NestJS repository (AC1, AC2): each check of a TypeScript project, once with a
 * case that passes and once with one that fails. Their `package.json` scripts stand in for
 * Prettier, ESLint, tsc and the test runner; `layers` needs the project's dependency-cruiser,
 * which the examples never have.
 */

const CHECKS = [
  "format",
  "lint",
  "typecheck",
  "tests",
  "strict-types",
  "layers",
  "function-lines",
  "complexity",
  "generated",
  "max-lines",
  "focused-tests",
  "skipped-tests",
  "todo",
  "secrets",
  "spec-approved",
  "scope",
  "dependencies",
  "fix-tests",
  "tests-removed",
];

const TOOLS = toolScript({
  format: { token: "\t", output: "[warn] {path}" },
  lint: {
    token: "debugger",
    output: "{abs}\n  {line}:3  error  Unexpected 'debugger' statement  no-debugger",
  },
  typecheck: {
    token: ': number = "',
    output: "{path}({line},14): error TS2322: Type 'string' is not assignable to type 'number'.",
  },
  tests: { token: "toBe(2)", output: " FAIL  {path} > adds\nAssertionError: expected 1 to be 2" },
});

const PRICES = "export const PRICES = {json} as const;\n";

const FRAMEWORKS = {
  angular: {
    dependency: { "@angular/core": "20.3.0" },
    import: 'import { Injectable } from "@angular/core";',
  },
  nestjs: {
    dependency: { "@nestjs/core": "11.1.6", "@nestjs/common": "11.1.6" },
    import: 'import { Injectable } from "@nestjs/common";',
  },
} as const;

type Framework = keyof typeof FRAMEWORKS;

const SPEC = `---
kind: standard
allowedDependencies: [zod]
---

# Carrito

## Objetivo

El carrito suma sus precios y aplica descuentos.

## Fuera de alcance

- Impuestos.

## Supuestos

- A1: Los precios llegan en céntimos.

## Criterios de aceptación

- AC1: CUANDO el carrito tiene precios ENTONCES su total es la suma.

## Archivos

- modificar package.json — zod
- modificar src/app/cart.ts — el descuento
- crear src/app/cart.spec.ts — su test
- crear src/app/catalog.ts — el catálogo
- modificar src/app/prices.json — un precio más
- modificar src/app/prices.gen.ts — generado de prices.json
- modificar src/domain/user.ts — el usuario
- modificar src/domain/user.spec.ts — sus tests
- borrar src/legacy/legacy.spec.ts — ya no aplica

## Tareas

- [ ] T1: El descuento
  - files: src/app/cart.ts, src/app/cart.spec.ts
  - ac: AC1
  - type: fix
- [ ] T2: El catálogo y el usuario
  - files: package.json, src/app/catalog.ts, src/domain/user.ts, src/domain/user.spec.ts, src/legacy/legacy.spec.ts
  - ac: AC1
- [ ] T3: Los precios
  - files: src/app/prices.json, src/app/prices.gen.ts
  - ac: AC1
`;

const TOTAL = [
  "export function total(prices: readonly number[]): number {",
  "  return prices.reduce((sum, price) => sum + price, 0);",
  "}",
];

const USER = ["export interface User {", "  readonly name: string;", "}", ""];

function manifest(framework: Framework, added: Readonly<Record<string, string>>): string {
  const scripts = {
    "format:check": "node tool/check.mjs format src",
    lint: "node tool/check.mjs lint src",
    typecheck: "node tool/check.mjs typecheck src",
    test: "node tool/check.mjs tests src",
  };
  const dependencies = { ...FRAMEWORKS[framework].dependency, ...added };
  const pkg = { name: "tienda", private: true, scripts, dependencies };
  return `${JSON.stringify({ ...pkg, devDependencies: { typescript: "5.9.3" } }, null, 2)}\n`;
}

function example(framework: Framework): Example {
  return {
    base: {
      "package.json": manifest(framework, {}),
      "tsconfig.json": '{ "compilerOptions": { "strict": true } }\n',
      "src/app/cart.ts": `${TOTAL.join("\n")}\n`,
      "src/app/prices.json": "[100, 250]\n",
      "src/app/prices.gen.ts": rendered(PRICES, [100, 250]),
      "src/domain/user.ts": USER.join("\n"),
      "src/domain/user.spec.ts": 'it("names the user", () => {});\n',
      "src/legacy/legacy.spec.ts": 'it("adds", () => {});\nit("rounds", () => {});\n',
      "tool/check.mjs": TOOLS,
      "tool/generate.mjs": generatorScript("src/app/prices.json", "src/app/prices.gen.ts", PRICES),
    },
    checks: [
      "checks:",
      "  layers:",
      '    domain: { paths: ["src/domain/**"], forbiddenPackages: ["@angular/*", "@nestjs/*"] }',
      '    app: { paths: ["src/app/**"], may: [domain] }',
      "  generators:",
      '    - { command: "node tool/generate.mjs", inputs: ["src/app/prices.json"], outputs: ["src/app/prices.gen.ts"] }',
      "",
    ].join("\n"),
    spec: SPEC,
  };
}

/** Everything within the plan: the fix with its test, an allowed dependency, the output regenerated. */
function passing(framework: Framework): Case {
  const cart = [
    `// ${MARK.todo}(#12): descuentos por volumen`,
    ...TOTAL,
    "export function discount(price: number, code: string): number {",
    '  return code === "C1" ? price - 1 : price;',
    "}",
    "",
  ];
  return {
    write: {
      "package.json": manifest(framework, { zod: "3.25.76" }),
      "src/app/cart.ts": cart.join("\n"),
      "src/app/cart.spec.ts": 'it("adds the prices", () => {\n  expect(1).toBe(1);\n});\n',
      "src/app/catalog.ts": "export const ITEMS = 3;\n",
      "src/app/prices.json": "[100, 250, 400]\n",
      "src/app/prices.gen.ts": rendered(PRICES, [100, 250, 400]),
      "src/domain/user.ts": [
        ...USER.slice(0, 2),
        "  readonly email: string;",
        ...USER.slice(2),
      ].join("\n"),
      "src/domain/user.spec.ts": 'it("names the user", () => {});\nit("has an email", () => {});\n',
    },
  };
}

/** One failure of each check at once, outside the plan too. */
function failing(framework: Framework): Case {
  const cart = [
    `// ${MARK.todo}: descuentos por volumen`,
    `export const raw: ${MARK.any} = JSON.parse("{}");`,
    'export const count: number = "2";',
    ...TOTAL.slice(0, 1),
    "\tdebugger;",
    ...TOTAL.slice(1),
    "export function discount(price: number, code: string): number {",
    "  let result = price;",
    ...repeat(12, (index) => `  if (code === "C${index}") result -= ${index};`),
    ...repeat(40, (index) => `  result += ${index} - ${index};`),
    "  return result;",
    "}",
    "",
  ];
  const tests = [
    `it${MARK.only}("names the user", () => {\n  expect(1).toBe(2);\n});`,
    `it${MARK.skipped}("has an email", () => {});`,
    "",
  ];
  return {
    write: {
      [SPEC_FILE]: SPEC.replace("aplica descuentos", "aplica descuentos e impuestos"),
      "package.json": manifest(framework, { "left-pad": "1.3.0" }),
      "src/app/cart.ts": cart.join("\n"),
      "src/app/catalog.ts": repeat(520, (index) => `export const item${index} = ${index};`).join(
        "\n",
      ),
      "src/app/prices.json": "[100, 250, 400]\n",
      "src/app/extra.ts": `export const token = "${githubToken()}";\n`,
      "src/domain/user.ts": `${FRAMEWORKS[framework].import}\n${USER.join("\n")}`,
      "src/domain/user.spec.ts": tests.join("\n"),
    },
    remove: ["src/legacy/legacy.spec.ts"],
  };
}

describe.each(["angular", "nestjs"] as const)("the %s example of specty check", (framework) => {
  const scanner = hasSecretScanner();

  it("passes every check its tools can run when the change keeps to the plan (AC2, AC3)", async () => {
    expect(await statuses(example(framework), passing(framework))).toEqual(
      expected(CHECKS, "passed", { layers: "skipped", secrets: scanner ? "passed" : "skipped" }),
    );
  });

  it("fails every check its tools can run when the change breaks them all (AC1, AC3)", async () => {
    expect(await statuses(example(framework), failing(framework))).toEqual(
      expected(CHECKS, "failed", {
        layers: "skipped",
        secrets: scanner ? "failed" : "skipped",
        "tests-removed": "warned",
      }),
    );
  });
});
