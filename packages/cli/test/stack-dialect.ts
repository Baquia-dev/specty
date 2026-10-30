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
  type ToolRule,
  toolScript,
} from "./stack-examples";

/**
 * The examples of the stacks beyond TypeScript and Flutter (ADR 0012), each one built from the
 * data of its stack: the same spec, tasks and cases as Flutter's, in the stack's own files,
 * syntax and tools. Its commands are stand-ins of the ones Specty detects in the stack, because
 * the real ones need the SDK and the dependencies installed; a command Specty does not detect
 * there is not in the example either.
 */

type Files = Readonly<Record<string, string>>;

/** Where each file of the example lives. */
interface Paths {
  readonly manifest: string;
  readonly cart: string;
  readonly cartTest: string;
  readonly catalog: string;
  /** The generator's input, a JSON list of prices, and its output. */
  readonly prices: string;
  readonly pricesData: string;
  /** In the domain layer, with its test. */
  readonly user: string;
  readonly userTest: string;
  readonly legacyTest: string;
  /** Outside the plan, with a secret. */
  readonly leak: string;
}

/** A stand-in of one of the project's tools, run on `folder`. */
interface Tool extends ToolRule {
  readonly folder: string;
}

/** A test case: it passes unless it `fails`, and it may be focused or switched off. */
interface TestCase {
  readonly name: string;
  readonly fails?: true;
  readonly focused?: true;
  readonly skipped?: true;
}

/** The source of the example, in the stack's syntax. */
interface Code {
  /** How a comment starts. */
  readonly comment: string;
  /** The cart: `total`, and the lines of `discount` after it. */
  cart(discount: readonly string[]): string;
  /** `discount(price, code)` around the lines of its body. */
  discount(body: readonly string[]): string[];
  /** The body that keeps to the plan. */
  readonly fixed: readonly string[];
  /** The first lines of a body that breaks every rule: each tool's token and a suppression. They declare `result`. */
  readonly broken: readonly string[];
  /** A condition on `code` that changes `result`. */
  branch(index: number): string;
  /** A plain statement on `result`. */
  step(index: number): string;
  /** The body's last line. */
  readonly result: string;
  catalog(count: number): string;
  /** What the generator writes, with `{json}` for the list of prices. */
  readonly prices: string;
  /** The user, with an email, or importing a package its layer may not. */
  user(shape: { readonly email?: true; readonly forbidden?: true }): string;
  tests(subject: string, cases: readonly TestCase[]): string;
  /** A source that holds `token`. */
  leak(token: string): string;
}

export interface Dialect {
  readonly name: string;
  readonly paths: Paths;
  /** The rest of the repository: its build, its configuration… */
  readonly files?: Files;
  /** The manifest, with the dependency lines of `added`. */
  manifest(added: readonly string[]): string;
  /** The dependency the spec allows, by name, with its line, and the line of one it does not. */
  readonly dependencies: {
    readonly allowed: string;
    readonly line: string;
    readonly forbidden: string;
  };
  /** The stand-ins of the commands Specty detects in the stack, by check. */
  readonly tools: Readonly<Record<string, Tool>>;
  /** The domain layer and a package it may not import, when Specty reads the stack's imports. */
  readonly layers?: { readonly domain: string; readonly forbidden: string };
  /** Whether the catalog has a marker of a focused test, and of a switched-off one. */
  readonly markers: { readonly focused: boolean; readonly skipped: boolean };
  readonly code: Code;
}

/** The checks of any stack after its commands, `suppressions` and `layers`. */
const COMMON = [
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

/** `lines`, each one behind `prefix`. */
export function indent(lines: readonly string[], prefix: string): string[] {
  return lines.map((line) => (line === "" ? line : `${prefix}${line}`));
}

/** `names the user` as `names_the_user`. */
export function snake(name: string): string {
  return name.replaceAll(" ", "_");
}

/** `names the user` as `NamesTheUser`. */
export function pascal(name: string): string {
  return name
    .split(" ")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join("");
}

/** `names the user` as `namesTheUser`. */
export function camel(name: string): string {
  const joined = pascal(name);
  return `${joined.slice(0, 1).toLowerCase()}${joined.slice(1)}`;
}

/** The example of each stack, with a change that keeps to the plan and one that breaks it all. */
export function describeExamples(dialects: readonly Dialect[]): void {
  describe.each(dialects)("the $name example of specty check", (dialect) => {
    const scanner = hasSecretScanner();
    const ids = checksOf(dialect);

    it("passes every check when the change keeps to the plan (AC1, AC3)", async () => {
      expect(await statuses(example(dialect), passing(dialect))).toEqual(
        expected(ids, "passed", { secrets: scanner ? "passed" : "skipped" }),
      );
    });

    it("fails every check of its stack when the change breaks them all (AC2, AC3)", async () => {
      expect(await statuses(example(dialect), failing(dialect))).toEqual(
        expected(ids, "failed", {
          secrets: scanner ? "failed" : "skipped",
          "criteria-tested": "warned",
          "tests-removed": "warned",
          ...(dialect.markers.focused ? {} : { "focused-tests": "passed" }),
          ...(dialect.markers.skipped ? {} : { "skipped-tests": "passed" }),
        }),
      );
    });
  });
}

function checksOf(dialect: Dialect): string[] {
  const layers = dialect.layers === undefined ? [] : ["layers"];
  return [...Object.keys(dialect.tools), "suppressions", ...layers, ...COMMON];
}

function example(dialect: Dialect): Example {
  const { paths, code } = dialect;
  return {
    base: {
      ...dialect.files,
      [paths.manifest]: dialect.manifest([]),
      [paths.cart]: code.cart([]),
      [paths.prices]: "[100, 250]\n",
      [paths.pricesData]: rendered(code.prices, [100, 250]),
      [paths.user]: code.user({}),
      [paths.userTest]: code.tests("User", [{ name: "names the user" }]),
      [paths.legacyTest]: code.tests("Legacy", [{ name: "adds" }, { name: "rounds" }]),
      "tool/check.mjs": toolScript(dialect.tools),
      "tool/generate.mjs": generatorScript(paths.prices, paths.pricesData, code.prices),
    },
    checks: checksBlock(dialect),
    spec: spec(dialect),
  };
}

/** Everything within the plan: the fix with its test, an allowed dependency, the output regenerated. */
function passing(dialect: Dialect): Case {
  const { paths, code } = dialect;
  return {
    write: {
      [paths.manifest]: dialect.manifest([dialect.dependencies.line]),
      [paths.cart]: code.cart(code.discount([pending(code, "(#12)"), ...code.fixed])),
      [paths.cartTest]: code.tests("Cart", [{ name: "adds the prices AC1" }]),
      [paths.catalog]: code.catalog(3),
      [paths.prices]: "[100, 250, 400]\n",
      [paths.pricesData]: rendered(code.prices, [100, 250, 400]),
      [paths.user]: code.user({ email: true }),
      [paths.userTest]: code.tests("User", [{ name: "names the user" }, { name: "has an email" }]),
    },
  };
}

/** One failure of each check at once, outside the plan too. */
function failing(dialect: Dialect): Case {
  const { paths, code } = dialect;
  const body = [
    pending(code, ""),
    ...code.broken,
    ...repeat(12, code.branch),
    ...repeat(40, code.step),
    code.result,
  ];
  return {
    write: {
      [SPEC_FILE]: spec(dialect).replace("aplica descuentos", "aplica descuentos e impuestos"),
      [paths.manifest]: dialect.manifest([dialect.dependencies.forbidden]),
      [paths.cart]: code.cart(code.discount(body)),
      [paths.catalog]: code.catalog(520),
      [paths.prices]: "[100, 250, 400]\n",
      [paths.leak]: code.leak(githubToken()),
      [paths.user]: code.user({ forbidden: true }),
      [paths.userTest]: code.tests("User", [
        { name: "names the user", fails: true, focused: true },
        { name: "has an email", skipped: true },
      ]),
    },
    remove: [paths.legacyTest],
  };
}

function pending(code: Code, reference: string): string {
  return `${code.comment} ${MARK.todo}${reference}: descuentos por volumen`;
}

/** `vulnerabilities` stays off: an OSV-Scanner on the machine would ask osv.dev about go.mod. */
function checksBlock({ tools, layers, paths }: Dialect): string {
  const quoted = (path: string) => JSON.stringify(path);
  return [
    "checks:",
    "  levels: { vulnerabilities: off }",
    "  commands:",
    ...Object.entries(tools).map(
      ([id, tool]) => `    ${id}: "node tool/check.mjs ${id} ${tool.folder}"`,
    ),
    ...(layers === undefined
      ? []
      : [
          "  layers:",
          `    domain: { paths: [${quoted(layers.domain)}], forbiddenPackages: [${quoted(layers.forbidden)}] }`,
        ]),
    "  generators:",
    `    - { command: "node tool/generate.mjs", inputs: [${quoted(paths.prices)}], outputs: [${quoted(paths.pricesData)}] }`,
    "",
  ].join("\n");
}

function spec({ paths, dependencies }: Dialect): string {
  return `---
kind: standard
allowedDependencies: [${JSON.stringify(dependencies.allowed)}]
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

- modificar ${paths.manifest} — ${dependencies.allowed}
- modificar ${paths.cart} — el descuento
- crear ${paths.cartTest} — su test
- crear ${paths.catalog} — el catálogo
- modificar ${paths.prices} — un precio más
- modificar ${paths.pricesData} — generado de los precios
- modificar ${paths.user} — el usuario
- modificar ${paths.userTest} — sus tests
- borrar ${paths.legacyTest} — ya no aplica

## Tareas

- [ ] T1: El descuento
  - files: ${paths.cart}, ${paths.cartTest}
  - ac: AC1
  - type: fix
- [ ] T2: El catálogo y el usuario
  - files: ${paths.manifest}, ${paths.catalog}, ${paths.user}, ${paths.userTest}
  - ac: AC1
- [ ] T3: Los precios
  - files: ${paths.prices}, ${paths.pricesData}, ${paths.legacyTest}
  - ac: AC1
`;
}
