// SPDX-License-Identifier: Apache-2.0
import { type FunctionMetric, measure, type Span } from "./function-spans";

/**
 * The functions of a Ruby source: a `def` and the `end` that closes it, counting the blocks
 * opened and closed on the way. A block opens with a keyword at the start of a statement or after
 * an `=`, never as a modifier (`x if y`), or with a `do`. A line of code has no strings or comment.
 */

const DEF = /^def\s+(?:self\.)?(\w+[?!=]?)/;
// `def name = expr` and `def name(args) = expr`, but not a setter: `def name=(value)`.
const ENDLESS = /^def\s+(?:self\.)?\w+[?!]?(?:\([^)]*\)\s*|\s+)=(?!=)/;
const OPENS =
  /^(?:def|class|module|begin|if|unless|while|until|case|for)\b|=\s*(?:if|unless|case|begin|while|until)\b|\bdo\b(?:\s*\|[^|]*\|)?\s*$/;
const ENDS = /\bend\b/g;
const BRANCHES = /\b(?:if|elsif|unless|while|until|for|when|rescue|and|or)\b|&&|\|\||\s\?\s/g;

export function rubyFunctions(text: string): FunctionMetric[] {
  const lines = text.split(/\r?\n/).map((line) => strip(line).trim());
  const spans = lines.flatMap((code, start): Span[] => {
    const name = DEF.exec(code)?.[1];
    if (name === undefined) return [];
    if (ENDLESS.test(code)) return [{ name, start, end: start }];
    const end = closingEnd(lines, start);
    return end === undefined ? [] : [{ name, start, end }];
  });
  return measure(lines, spans, BRANCHES);
}

/** The line of the `end` that closes the block opened on `start`. */
function closingEnd(lines: readonly string[], start: number): number | undefined {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const code = lines[index] ?? "";
    depth += (OPENS.test(code) ? 1 : 0) - (code.match(ENDS)?.length ?? 0);
    if (depth <= 0) return index;
  }
  return undefined;
}

/** The line with each string left as `""` and without its comment. */
function strip(line: string): string {
  const code = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const comment = code.indexOf("#");
  return comment === -1 ? code : code.slice(0, comment);
}
