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
  const cursor: Cursor = { code: "", comments: [], inBlock: startsInBlock, index: 0, ended: false };
  while (cursor.index < line.length && !cursor.ended) {
    if (cursor.inBlock) blockComment(line, cursor);
    else if (line.startsWith("//", cursor.index)) {
      cursor.comments.push(line.slice(cursor.index + 2));
      cursor.ended = true;
    } else if (line.startsWith("/*", cursor.index)) {
      cursor.inBlock = true;
      cursor.index += 2;
    } else codeChar(line, cursor, options);
  }
  return { code: cursor.code, comments: cursor.comments, inBlock: cursor.inBlock };
}

/** Where `split` is in a line: what it kept, and whether a line comment or an open block ended it. */
interface Cursor {
  code: string;
  readonly comments: string[];
  inBlock: boolean;
  index: number;
  ended: boolean;
}

/** The rest of a block comment: up to its `*\/`, or the whole line while it stays open. */
function blockComment(line: string, cursor: Cursor): void {
  const end = line.indexOf("*/", cursor.index);
  cursor.comments.push(line.slice(cursor.index, end === -1 ? line.length : end));
  if (end === -1) {
    cursor.ended = true;
    return;
  }
  cursor.inBlock = false;
  cursor.index = end + 2;
  cursor.code += " ";
}

/** A character of code, or a whole string left as an empty pair of quotes. */
function codeChar(line: string, cursor: Cursor, options: CodeOptions): void {
  const char = line.charAt(cursor.index);
  const close = char === '"' || char === "'" || char === "`" ? closing(line, cursor.index) : -1;
  if (close === -1 || (options.lifetimes === true && char === "'" && close > cursor.index + 3)) {
    cursor.code += char;
    cursor.index += 1;
  } else {
    cursor.code += `${char}${char}`;
    cursor.index = close + 1;
  }
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
