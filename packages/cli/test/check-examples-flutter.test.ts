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
 * A Flutter repository (AC1, AC2): each check of a Dart project, once with a case that passes and
 * once with one that fails. `checks.commands` points format, lint and tests at stand-ins of
 * `dart format`, `flutter analyze` and `flutter test`, which need the SDK and `pub get`; Dart has
 * no typecheck of its own. `layers` runs with Specty's own scanner, with no tools.
 */

const CHECKS = [
  "format",
  "lint",
  "tests",
  "dart-strict",
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
  "criteria-tested",
  "tests-removed",
];

const TOOLS = toolScript({
  format: { token: "\t", output: "Changed {path}" },
  lint: {
    token: "print(",
    output: "  info - {path}:{line}:3 - Don't invoke 'print' in production code. - avoid_print",
  },
  tests: { token: "expect(1, 2)", output: "{path}: adds the prices [E]\n  Expected: <2>" },
});

const PRICES = "const prices = <int>{json};\n";

const STRICT = ["strict-casts", "strict-inference", "strict-raw-types"];

const analysis = (value: boolean) =>
  ["analyzer:", "  language:", ...STRICT.map((mode) => `    ${mode}: ${value}`), ""].join("\n");

const SPEC = `---
kind: standard
allowedDependencies: [meta]
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

- modificar pubspec.yaml — meta
- modificar lib/cart.dart — el descuento
- crear test/cart_test.dart — su test
- crear lib/catalog.dart — el catálogo
- modificar lib/prices.json — un precio más
- modificar lib/prices_data.dart — generado de prices.json
- modificar lib/domain/user.dart — el usuario
- modificar test/domain/user_test.dart — sus tests
- borrar test/legacy_test.dart — ya no aplica

## Tareas

- [ ] T1: El descuento
  - files: lib/cart.dart, test/cart_test.dart
  - ac: AC1
  - type: fix
- [ ] T2: El catálogo y el usuario
  - files: pubspec.yaml, lib/catalog.dart, lib/domain/user.dart, test/domain/user_test.dart
  - ac: AC1
- [ ] T3: Los precios
  - files: lib/prices.json, lib/prices_data.dart, test/legacy_test.dart
  - ac: AC1
`;

const TOTAL = [
  "int total(List<int> prices) {",
  "  return prices.fold(0, (sum, price) => sum + price);",
  "}",
];

const USER = ["class User {", "  const User(this.name);", "  final String name;", "}", ""];

function pubspec(added: readonly string[]): string {
  return [
    "name: tienda",
    "environment:",
    "  sdk: ^3.9.0",
    "dependencies:",
    "  flutter:",
    "    sdk: flutter",
    "  collection: ^1.19.0",
    ...added.map((line) => `  ${line}`),
    "dev_dependencies:",
    "  flutter_test:",
    "    sdk: flutter",
    "",
  ].join("\n");
}

const EXAMPLE: Example = {
  base: {
    "pubspec.yaml": pubspec([]),
    "analysis_options.yaml": analysis(true),
    "lib/cart.dart": `${TOTAL.join("\n")}\n`,
    "lib/prices.json": "[100, 250]\n",
    "lib/prices_data.dart": rendered(PRICES, [100, 250]),
    "lib/domain/user.dart": USER.join("\n"),
    "test/domain/user_test.dart": "void main() {\n  test('names the user', () {});\n}\n",
    "test/legacy_test.dart": "void main() {\n  test('adds', () {});\n  test('rounds', () {});\n}\n",
    "tool/check.mjs": TOOLS,
    "tool/generate.mjs": generatorScript("lib/prices.json", "lib/prices_data.dart", PRICES),
  },
  checks: [
    "checks:",
    "  commands:",
    '    format: "node tool/check.mjs format lib"',
    '    lint: "node tool/check.mjs lint lib"',
    '    tests: "node tool/check.mjs tests test"',
    "  layers:",
    '    domain: { paths: ["lib/domain/**"], forbiddenPackages: ["flutter", "http"] }',
    '    ui: { paths: ["lib/ui/**"], may: [domain] }',
    "  generators:",
    '    - { command: "node tool/generate.mjs", inputs: ["lib/prices.json"], outputs: ["lib/prices_data.dart"] }',
    "",
  ].join("\n"),
  spec: SPEC,
};

/** Everything within the plan: the fix with its test, an allowed dependency, the output regenerated. */
const PASSING: Case = {
  write: {
    "pubspec.yaml": pubspec(["meta: ^1.16.0"]),
    "lib/cart.dart": [
      `// ${MARK.todo}(#12): descuentos por volumen`,
      ...TOTAL,
      "double discount(double price, String code) {",
      "  return code == 'C1' ? price - 1 : price;",
      "}",
      "",
    ].join("\n"),
    "test/cart_test.dart":
      "void main() {\n  test('AC1: adds the prices', () {\n    expect(1, 1);\n  });\n}\n",
    "lib/catalog.dart": "const items = 3;\n",
    "lib/prices.json": "[100, 250, 400]\n",
    "lib/prices_data.dart": rendered(PRICES, [100, 250, 400]),
    "lib/domain/user.dart": [
      ...USER.slice(0, 3),
      "  final String email = '';",
      ...USER.slice(3),
    ].join("\n"),
    "test/domain/user_test.dart":
      "void main() {\n  test('names the user', () {});\n  test('has an email', () {});\n}\n",
  },
};

/** One failure of each check at once, outside the plan too. */
const FAILING: Case = {
  write: {
    [SPEC_FILE]: SPEC.replace("aplica descuentos", "aplica descuentos e impuestos"),
    "pubspec.yaml": pubspec(["http: ^1.5.0"]),
    "analysis_options.yaml": analysis(false),
    "lib/cart.dart": [
      `// ${MARK.todo}: descuentos por volumen`,
      ...TOTAL.slice(0, 1),
      "  // ignore: avoid_print",
      "\tprint('total');",
      ...TOTAL.slice(1),
      "double discount(double price, String code) {",
      "  var result = price;",
      ...repeat(12, (index) => `  if (code == 'C${index}') result -= ${index};`),
      ...repeat(40, (index) => `  result += ${index} - ${index};`),
      "  return result;",
      "}",
      "",
    ].join("\n"),
    "lib/catalog.dart": repeat(520, (index) => `const item${index} = ${index};`).join("\n"),
    "lib/prices.json": "[100, 250, 400]\n",
    "lib/extra.dart": `const token = '${githubToken()}';\n`,
    "lib/domain/user.dart": `import 'package:flutter/foundation.dart';\n\n${USER.join("\n")}`,
    "test/domain/user_test.dart": [
      "void main() {",
      `  test('names the user', () {\n    expect(1, 2);\n  }, solo${": true"});`,
      `  test('has an email', () {}, skip${": true"});`,
      "}",
      "",
    ].join("\n"),
  },
  remove: ["test/legacy_test.dart"],
};

describe("the Flutter example of specty check", () => {
  const scanner = hasSecretScanner();

  it("passes every check when the change keeps to the plan (AC2, AC3)", async () => {
    expect(await statuses(EXAMPLE, PASSING)).toEqual(
      expected(CHECKS, "passed", { secrets: scanner ? "passed" : "skipped" }),
    );
  });

  it("fails every check when the change breaks them all (AC1, AC3)", async () => {
    expect(await statuses(EXAMPLE, FAILING)).toEqual(
      expected(CHECKS, "failed", {
        secrets: scanner ? "failed" : "skipped",
        "criteria-tested": "warned",
        "tests-removed": "warned",
      }),
    );
  });
});
