// SPDX-License-Identifier: Apache-2.0
import { type FunctionMetric, measure, type Span } from "./function-spans";

/**
 * The functions of a Python source, by indentation: a `def` and the lines of code indented deeper
 * than it. A line of code has no strings and no comment; a docstring, or any line inside a string
 * that spans lines, is none.
 */

interface Line {
  readonly indent: number;
  /** The line without strings or comment; `""` when it has no code. */
  readonly code: string;
}

const DEF = /^(?:async\s+)?def\s+(\w+)/;
const BRANCHES = /\b(?:if|elif|for|while|except|case|and|or)\b/g;
// A statement that is only a string, maybe with its prefixes: a docstring.
const ONLY_STRING = /^(?:[rRbBuUfF]*"")+$/;

export function pythonFunctions(text: string): FunctionMetric[] {
  const lines = codeLines(text);
  const spans = lines.flatMap((line, start): Span[] => {
    const name = DEF.exec(line.code)?.[1];
    return name === undefined ? [] : [{ name, start, end: lastLine(lines, start) }];
  });
  return measure(
    lines.map((line) => line.code),
    spans,
    BRANCHES,
  );
}

/** The last line of code of the function whose `def` is on `start`. */
function lastLine(lines: readonly Line[], start: number): number {
  const indent = lines[start]?.indent ?? 0;
  let end = headerEnd(lines, start);
  for (let index = end + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.code === "") continue;
    if (line.indent <= indent) break;
    end = index;
  }
  return end;
}

/** The line where a header that may take several lines closes its parameters with `:`. */
function headerEnd(lines: readonly Line[], start: number): number {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const code = lines[index]?.code ?? "";
    depth += (code.match(/[([{]/g)?.length ?? 0) - (code.match(/[)\]}]/g)?.length ?? 0);
    if (depth <= 0 && code.endsWith(":")) return index;
  }
  return start;
}

function codeLines(text: string): Line[] {
  // The quotes that close a string still open from an earlier line.
  let open: string | undefined;
  return text.split(/\r?\n/).map((raw): Line => {
    const indent = raw.length - raw.trimStart().length;
    const close = open === undefined ? 0 : raw.indexOf(open) + open.length;
    if (open !== undefined && close < open.length) return { indent, code: "" };
    const stripped = strip(raw.slice(close));
    open = stripped.open;
    const code = stripped.code.trim();
    return { indent, code: ONLY_STRING.test(code) ? "" : code };
  });
}

/** The line with each string left as `""` and without its comment; and a string it leaves open. */
function strip(line: string): { readonly code: string; readonly open?: string } {
  let code = "";
  let index = 0;
  while (index < line.length) {
    const char = line.charAt(index);
    if (char === "#") break;
    const triple = line.startsWith(char.repeat(3), index) ? char.repeat(3) : undefined;
    if ((char === '"' || char === "'") && triple !== undefined) {
      const close = line.indexOf(triple, index + 3);
      if (close === -1) return { code: `${code}""`, open: triple };
      code += '""';
      index = close + 3;
    } else if (char === '"' || char === "'") {
      code += '""';
      index = closingQuote(line, index) + 1;
    } else {
      code += char;
      index += 1;
    }
  }
  return { code };
}

/** The index of the quote that closes the one at `start`, or the end of the line. */
function closingQuote(line: string, start: number): number {
  const quote = line.charAt(start);
  for (let index = start + 1; index < line.length; index += 1) {
    if (line.charAt(index) === "\\") index += 1;
    else if (line.charAt(index) === quote) return index;
  }
  return line.length;
}
