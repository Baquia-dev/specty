// SPDX-License-Identifier: Apache-2.0

/**
 * The code of each line of a source in a language with `//` and `/* *\/` comments, with its
 * comments set apart and each string left empty, so that a check can look for syntax without a
 * parser. A block comment goes on across lines; a string left open runs to the end of its line.
 */

export interface CodeLine {
  /** The line without its comments, with each string left as an empty pair of quotes. */
  readonly code: string;
  readonly comments: readonly string[];
}

export interface CodeOptions {
  /** Rust: a `'` that does not close within three characters starts a lifetime, not a char. */
  readonly lifetimes?: boolean;
}

export function splitCode(text: string, options: CodeOptions = {}): CodeLine[] {
  let inBlock = false;
  return text.split(/\r?\n/).map((source) => {
    const parts = split(source, inBlock, options);
    inBlock = parts.inBlock;
    return { code: parts.code, comments: parts.comments };
  });
}

interface Parts extends CodeLine {
  /** Whether a block comment is still open at the end of the line. */
  readonly inBlock: boolean;
}

function split(line: string, startsInBlock: boolean, options: CodeOptions): Parts {
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
      const close = char === '"' || char === "'" || char === "`" ? closing(line, index) : -1;
      if (close === -1 || (options.lifetimes === true && char === "'" && close > index + 3)) {
        code += char;
        index += 1;
      } else {
        code += `${char}${char}`;
        index = close + 1;
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
