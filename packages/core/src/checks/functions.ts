// SPDX-License-Identifier: Apache-2.0
import { splitCode } from "./code";
import { type FunctionMetric, measure } from "./function-spans";
import { pythonFunctions } from "./functions-python";
import { rubyFunctions } from "./functions-ruby";

/**
 * The functions of a source, measured line by line: where each one starts and ends, its lines of
 * code and its cyclomatic complexity. It is an estimate without a parser: one for every language
 * with braces, and their own for Python, by indentation, and for Ruby, by `def … end`.
 */

export type { FunctionMetric } from "./function-spans";

const BRACES =
  /\.(?:[cm]?[jt]sx?|java|kts?|cs|go|rs|swift|dart|php|c|h|cc|cpp|cxx|hpp|hh|scala|groovy)$/;

const CONTROL =
  "(?:if|for|foreach|while|switch|catch|when|using|lock|synchronized|guard|match|select|with)";
// A block that a control statement opens, by its first word or the word before its condition.
const CONTROL_START = new RegExp(
  String.raw`^(?:\}\s*)?(?:else\s+)?(?:${CONTROL}|do|try|finally|else)\b`,
);
const PARENS = String.raw`\([^()]*(?:\([^()]*\)[^()]*)*\)`;
const CONTROL_CONDITION = new RegExp(String.raw`\b${CONTROL}\s*${PARENS}\s*$`);
const TYPE_DECLARATION =
  /\b(?:class|interface|struct|enum|object|record|impl|trait|extension|mixin|namespace|module)\b/;
const KEYWORD = /(?:^|[^\w$.])(?:function|func|fun|fn)\b/;
const ARROW = /=>\s*$/;
// The parameters close the header, maybe with a return type, `throws` or a modifier behind.
const PARAMETERS =
  /\)\s*(?:(?::|->)\s*[^{}]*|\bthrows\b[^{}]*|\b(?:async|sync|const|override|noexcept|mutable)\b\s*\*?\s*)*$/;

const NAMES: readonly RegExp[] = [
  /\bfunction\s*\*?\s*([\w$]+)/,
  /\bfunc\s+(?:\([^)]*\)\s*)?([\w$]+)/,
  /\bfun\s+(?:<[^>]*>\s*)?(?:[\w$.]+\.)?([\w$]+)/,
  /\bfn\s+([\w$]+)/,
  /\b(?:const|let|var|val|final)\s+([\w$]+)\s*(?::[^=]*)?=/,
  new RegExp(String.raw`([\w$]+)\s*(?:<[^<>]*(?:<[^<>]*>[^<>]*)*>)?\s*${PARENS}[^()]*$`),
];
const NOT_NAMES: ReadonlySet<string> = new Set([
  "function",
  "func",
  "fun",
  "fn",
  "async",
  "await",
  "return",
  "new",
]);

// Each branch: a condition, a loop, a case, a catch, a logical operator or a ternary. `guard` is
// Swift's `guard … else`, not a name that other languages give a variable.
const BRANCHES =
  /\b(?:if|for|foreach|while|case|catch)\b|\bguard\b(?=.*\belse\b)|&&|\|\||\?\?|\s\?\s/g;

export function functionMetrics(path: string, text: string): FunctionMetric[] {
  if (/\.pyi?$/.test(path)) return pythonFunctions(text);
  if (/\.(?:rb|rake)$/.test(path)) return rubyFunctions(text);
  if (!BRACES.test(path)) return [];
  const lines = splitCode(text, { lifetimes: path.endsWith(".rs") }).map((line) =>
    line.code.trim(),
  );
  const spans = headers(lines).flatMap((header) => {
    const end = closingLine(lines, header.open);
    return end === undefined ? [] : [{ ...header, end }];
  });
  return measure(lines, spans, BRANCHES);
}

interface Header {
  readonly name?: string;
  /** Index of its first line. */
  readonly start: number;
  /** Index of the line whose last `{` opens the body. */
  readonly open: number;
}

function headers(lines: readonly string[]): Header[] {
  return lines.flatMap((code, open): Header[] => {
    if (!code.endsWith("{")) return [];
    let start = open;
    let text = code.slice(0, -1).trim();
    // A brace alone on its line opens the header of the line before (Allman style).
    if (text === "") {
      start = previousCode(lines, open);
      if (start === -1) return [];
      text = lines[start] ?? "";
    }
    // A header that takes several lines starts where its parameters open.
    while (balance(text) < 0 && start > 0) {
      start -= 1;
      text = `${lines[start] ?? ""} ${text}`;
    }
    if (!isFunction(text)) return [];
    const name = nameOf(text);
    return [name === undefined ? { start, open } : { name, start, open }];
  });
}

function isFunction(header: string): boolean {
  if (ARROW.test(header)) return true;
  if (CONTROL_START.test(header) || CONTROL_CONDITION.test(header)) return false;
  if (TYPE_DECLARATION.test(header)) return false;
  return KEYWORD.test(header) || PARAMETERS.test(header);
}

function nameOf(header: string): string | undefined {
  for (const pattern of NAMES) {
    const name = pattern.exec(header)?.[1];
    if (name !== undefined) return NOT_NAMES.has(name) ? undefined : name;
  }
  return undefined;
}

/** The line where the brace that ends line `open` closes. */
function closingLine(lines: readonly string[], open: number): number | undefined {
  let depth = 1;
  for (let index = open + 1; index < lines.length; index += 1) {
    for (const char of lines[index] ?? "") {
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function previousCode(lines: readonly string[], index: number): number {
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    if ((lines[candidate] ?? "") !== "") return candidate;
  }
  return -1;
}

/** Opening parentheses minus closing ones. */
function balance(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === "(") count += 1;
    else if (char === ")") count -= 1;
  }
  return count;
}
