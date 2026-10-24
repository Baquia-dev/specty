// SPDX-License-Identifier: Apache-2.0

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
  const violations: StrictTypeViolation[] = [];
  let inBlock = false;
  text.split(/\r?\n/).forEach((source, index) => {
    const parts = split(source, inBlock);
    inBlock = parts.inBlock;
    const code = parts.code.trimEnd();
    const line = index + 1;
    if (ANY_TYPE.some((pattern) => pattern.test(code))) {
      violations.push({ line, rule: "explicit-any" });
    }
    if (parts.comments.some((comment) => TS_COMMENT.test(comment))) {
      violations.push({ line, rule: "ts-comment" });
    }
    if (assertion.test(code)) violations.push({ line, rule: "non-null-assertion" });
  });
  return violations;
}

interface Parts {
  /** The line without its comments, with each string left empty. */
  readonly code: string;
  readonly comments: readonly string[];
  /** Whether a block comment is still open at the end of the line. */
  readonly inBlock: boolean;
}

function split(line: string, startsInBlock: boolean): Parts {
  let code = "";
  const comments: string[] = [];
  let inBlock = startsInBlock;
  let index = 0;
  while (index < line.length) {
    if (inBlock) {
      const end = line.indexOf("*/", index);
      comments.push(line.slice(index, end === -1 ? line.length : end));
      if (end === -1) break;
      inBlock = false;
      index = end + 2;
      code += " ";
    } else if (line.startsWith("//", index)) {
      comments.push(line.slice(index + 2));
      break;
    } else if (line.startsWith("/*", index)) {
      inBlock = true;
      index += 2;
    } else {
      const char = line.charAt(index);
      if (char === '"' || char === "'" || char === "`") {
        code += `${char}${char}`;
        index = closing(line, index) + 1;
      } else {
        code += char;
        index += 1;
      }
    }
  }
  return { code, comments, inBlock };
}

/** Where the string that opens at `start` closes; a string left open runs to the end of the line. */
function closing(line: string, start: number): number {
  const quote = line.charAt(start);
  for (let index = start + 1; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (char === "\\") index += 1;
    else if (char === quote) return index;
  }
  return line.length;
}
