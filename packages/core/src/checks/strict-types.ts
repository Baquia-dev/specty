// SPDX-License-Identifier: Apache-2.0
import { splitCode } from "./code";

/**
 * Specty's own detection of what strict TypeScript forbids, for a project with no ESLint to
 * ask: an explicit `any`, a comment that switches the checker off and a non-null assertion. It
 * reads line by line, with comments and strings set apart first, so it needs no parser; ESLint,
 * when the project has it, decides with the real syntax tree instead.
 */

export type StrictTypeRule = "explicit-any" | "ts-comment" | "non-null-assertion";

export interface StrictTypeViolation {
  readonly line: number;
  readonly rule: StrictTypeRule;
}

// `any` where a type goes; not a value called `any`, as in `foo(any)` or `any.length`.
const ANY_TYPE: readonly RegExp[] = [
  /(?:[:<|&]|=>)\s*any\b(?!\s*[(.])/,
  /\b(?:as|extends|keyof)\s+any\b(?!\s*[(.])/,
  /\bany\s*\[\]/,
  /,\s*any\s*>/,
  /^\s*(?:export\s+)?(?:declare\s+)?type\s+[\w$]+(?:<.*>)?\s*=\s*any\b/,
];

// The checker only obeys these at the start of a comment.
const TS_COMMENT = /^\s*\*?\s*@ts-(?:ignore|nocheck)\b/;

/** `!` right after a name, `)` or `]`, and before what can follow an expression. */
function nonNull(tsx: boolean): RegExp {
  // In JSX, a line of text can end in `!`.
  return new RegExp(String.raw`[\w$)\]]!(?=[.\[),;]${tsx ? "" : "|$"})`);
}

export function strictTypeViolations(text: string, tsx: boolean): StrictTypeViolation[] {
  const assertion = nonNull(tsx);
  return splitCode(text).flatMap((parts, index): StrictTypeViolation[] => {
    const code = parts.code.trimEnd();
    const line = index + 1;
    return [
      ...(ANY_TYPE.some((pattern) => pattern.test(code))
        ? [{ line, rule: "explicit-any" as const }]
        : []),
      ...(parts.comments.some((comment) => TS_COMMENT.test(comment))
        ? [{ line, rule: "ts-comment" as const }]
        : []),
      ...(assertion.test(code) ? [{ line, rule: "non-null-assertion" as const }] : []),
    ];
  });
}
