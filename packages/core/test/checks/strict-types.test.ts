// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { strictTypeViolations } from "../../src";

/** `line:rule` of each violation in `lines`. */
const found = (lines: readonly string[], tsx = false) =>
  strictTypeViolations(lines.join("\n"), tsx).map(
    (violation) => `${violation.line}:${violation.rule}`,
  );

describe("strictTypeViolations", () => {
  it("finds an explicit any wherever a type goes", () => {
    expect(
      found([
        "const x: any = 1;",
        "const y = value as any;",
        "const list: Array<any> = [];",
        "const map = new Map<string, any>();",
        "type Loose = any;",
        "export function load(): Promise<any[]> {",
        "function keys<T extends any>(value: T) {}",
        "const rows: any[] = [];",
      ]),
    ).toEqual([
      "1:explicit-any",
      "2:explicit-any",
      "3:explicit-any",
      "4:explicit-any",
      "5:explicit-any",
      "6:explicit-any",
      "7:explicit-any",
      "8:explicit-any",
    ]);
  });

  it("finds the comments that switch the type checker off, only at their start", () => {
    expect(
      found([
        "// @ts-ignore",
        "/* @ts-nocheck */",
        "  // @ts-ignore: the types of the lib are wrong",
        "// we never write @ts-ignore here",
        "// @ts-expect-error the lib's types are wrong",
      ]),
    ).toEqual(["1:ts-comment", "2:ts-comment", "3:ts-comment"]);
  });

  it("finds a non-null assertion, and both rules on one line", () => {
    expect(
      found([
        "const name = user!.name;",
        "const first = items[0]!;",
        "call(maybe!)",
        "const done = ready!",
        "const v: any = store!.value;",
      ]),
    ).toEqual([
      "1:non-null-assertion",
      "2:non-null-assertion",
      "3:non-null-assertion",
      "4:non-null-assertion",
      "5:explicit-any",
      "5:non-null-assertion",
    ]);
  });

  it("leaves out comments, strings, names and the other uses of !", () => {
    expect(
      found([
        "// any value goes here, user!.name",
        'const label = "type: any";',
        "const greeting = 'Hello!';",
        "const template = `as any`;",
        "foo(any);",
        "const company = anyCompany;",
        "if (a !== b && !c) {}",
        "let total!: number;",
        "/* a comment",
        "   that goes on: any, user!.name",
        "   and ends here */ const z = 1;",
      ]),
    ).toEqual([]);
  });

  it("does not take JSX text that ends in ! for an assertion", () => {
    expect(found(["  <p>Welcome back!", "  </p>"], true)).toEqual([]);
    expect(found(["const v = cache!"], false)).toEqual(["1:non-null-assertion"]);
  });
});
