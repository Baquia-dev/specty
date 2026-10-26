// SPDX-License-Identifier: Apache-2.0

export interface Token {
  readonly text: string;
  /** Redirection (`>`, `>>`, `2>`, `&>`, `<`, `<<`, `<<<`) rather than a word. */
  readonly operator: boolean;
}

/** A simple command, with its words and redirections, or where a subshell opens or closes. */
export type Piece = readonly Token[] | "(" | ")";

/** A heredoc opened on the current line; its body starts on the next one. */
interface Heredoc {
  readonly delimiter: string;
  /** `<<-`: the closing line may start with tabs. */
  readonly stripTabs: boolean;
}

interface State {
  readonly pieces: (Token[] | "(" | ")")[];
  readonly heredocs: Heredoc[];
  word: string;
  started: boolean;
  quote: '"' | "'" | undefined;
  /** Depth of `((…))` and `$((…))`, where `<`, `>`, `&`, `|` and parentheses are arithmetic. */
  arithmetic: number;
}

/** Characters that end an unquoted word. */
const METACHARACTERS: ReadonlySet<string> = new Set([..." \t\n;&|<>()"]);
const ARITHMETIC: ReadonlySet<string> = new Set([..."<>&|()"]);

/**
 * Splits a shell command into simple commands (`;`, `&&`, `||`, `|`, `&`, newlines) made of
 * words and redirections, and marks where each subshell (`(…)`, `$(…)`) opens and closes. Like
 * bash, it skips comments and heredoc bodies, which do not run. Best effort: enough to read
 * intent, not a full shell grammar.
 */
export function tokenize(command: string): Piece[] {
  const state: State = {
    pieces: [[]],
    heredocs: [],
    word: "",
    started: false,
    quote: undefined,
    arithmetic: 0,
  };
  const chars = [...command];
  for (let index = 0; index < chars.length; index++) {
    index = step(state, chars, index);
  }
  flush(state);
  return state.pieces.filter((piece) => typeof piece === "string" || piece.length > 0);
}

function step(state: State, chars: readonly string[], index: number): number {
  const char = chars[index] ?? "";
  const next = chars[index + 1];
  if (state.quote !== undefined) return quoted(state, char, next, index);
  // In this order: a quote or an escape, a separator, a grouping, a redirection.
  const handled =
    opening(state, char, next, index) ??
    separating(state, chars, index) ??
    grouping(state, char, next, index) ??
    redirecting(state, chars, index);
  if (handled !== undefined) return handled;
  append(state, char);
  return index;
}

/** A quote that opens, or a character escaped with a backslash. */
function opening(
  state: State,
  char: string,
  next: string | undefined,
  index: number,
): number | undefined {
  if (char === "'" || char === '"') {
    state.quote = char;
    state.started = true;
    return index;
  }
  if (char === "\\" && next !== undefined) {
    append(state, next);
    return index + 1;
  }
  return undefined;
}

/** A blank that ends a word, or a newline, `;` or comment that ends a command. */
function separating(state: State, chars: readonly string[], index: number): number | undefined {
  const char = chars[index];
  if (char === " " || char === "\t") {
    flush(state);
    return index;
  }
  if (char === "\n") return skipHeredocs(state, chars, split(state, index));
  if (char === ";") return split(state, index);
  if (char === "#" && !state.started) return lineEnd(chars, index);
  return undefined;
}

/** Arithmetic `((…))` and what it holds, or a subshell that opens or closes. */
function grouping(
  state: State,
  char: string,
  next: string | undefined,
  index: number,
): number | undefined {
  if (char === "(" && next === "(") return arithmetic(state, 1, index);
  if (char === ")" && next === ")" && state.arithmetic > 0) return arithmetic(state, -1, index);
  if (state.arithmetic > 0 && ARITHMETIC.has(char)) {
    append(state, char);
    return index;
  }
  if (char === "(" || char === ")") return subshell(state, char, index);
  return undefined;
}

/** A redirection, an input or a heredoc, or `&` and `|` between commands. */
function redirecting(state: State, chars: readonly string[], index: number): number | undefined {
  const char = chars[index];
  if (char === ">") return redirect(state, chars[index + 1], index);
  if (char === "<") return input(state, chars, index);
  if (char === "&" || char === "|") return ampersandOrPipe(state, char, chars, index);
  return undefined;
}

function quoted(state: State, char: string, next: string | undefined, index: number): number {
  if (char === state.quote) {
    state.quote = undefined;
    return index;
  }
  if (char === "\\" && state.quote === '"' && next !== undefined) {
    append(state, next);
    return index + 1;
  }
  append(state, char);
  return index;
}

function redirect(state: State, next: string | undefined, index: number): number {
  const descriptor = state.started && /^[12]$/.test(state.word) ? state.word : "";
  if (descriptor === "") flush(state);
  else reset(state);
  const doubled = next === ">";
  current(state).push({ text: `${descriptor}${doubled ? ">>" : ">"}`, operator: true });
  return doubled ? index + 1 : index;
}

/** `<`, a here-string (`<<<`) or a heredoc (`<<`, `<<-`), whose body `skipHeredocs` skips. */
function input(state: State, chars: readonly string[], index: number): number {
  flush(state);
  if (chars[index + 1] !== "<") return operator(state, "<", index);
  if (chars[index + 2] === "<") return operator(state, "<<<", index + 2);
  const stripTabs = chars[index + 2] === "-";
  const delimiter = readWord(chars, skipBlanks(chars, index + (stripTabs ? 3 : 2)));
  if (delimiter.text === "") return operator(state, "<<", index + 1);
  operator(state, stripTabs ? "<<-" : "<<", index);
  current(state).push({ text: delimiter.text, operator: false });
  state.heredocs.push({ delimiter: delimiter.text, stripTabs });
  return delimiter.end;
}

function operator(state: State, text: string, end: number): number {
  current(state).push({ text, operator: true });
  return end;
}

function skipBlanks(chars: readonly string[], from: number): number {
  let index = from;
  while (chars[index] === " " || chars[index] === "\t") index++;
  return index;
}

/** The word that starts at `from` without its quotes (`EOF`, `'EOF'`, `\EOF`), and its last index. */
function readWord(chars: readonly string[], from: number): { text: string; end: number } {
  let text = "";
  let quote: string | undefined;
  let index = from;
  while (index < chars.length) {
    const char = chars[index] ?? "";
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else text += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "\\") {
      index++;
      text += chars[index] ?? "";
    } else if (METACHARACTERS.has(char)) {
      break;
    } else {
      text += char;
    }
    index++;
  }
  return { text, end: index - 1 };
}

/** At the end of a line that opened heredocs, skips their bodies in order; returns the last index. */
function skipHeredocs(state: State, chars: readonly string[], index: number): number {
  let end = index;
  for (const heredoc of state.heredocs.splice(0)) end = bodyEnd(chars, end + 1, heredoc);
  return end;
}

/** Last index of the body that starts at `from`: its closing line or, without one, the end. */
function bodyEnd(chars: readonly string[], from: number, heredoc: Heredoc): number {
  let start = from;
  while (start < chars.length) {
    const newline = chars.indexOf("\n", start);
    const end = newline === -1 ? chars.length : newline;
    const line = chars.slice(start, end).join("");
    if ((heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) {
      return Math.min(end, chars.length - 1);
    }
    start = end + 1;
  }
  return chars.length - 1;
}

/** A word that starts with `#` comments out the rest of the line: the index before its newline. */
function lineEnd(chars: readonly string[], index: number): number {
  const newline = chars.indexOf("\n", index);
  return newline === -1 ? chars.length - 1 : newline - 1;
}

/** `((` opens arithmetic (`((…))`, `$((…))`) and `))` closes it. */
function arithmetic(state: State, change: 1 | -1, index: number): number {
  state.arithmetic += change;
  append(state, change === 1 ? "((" : "))");
  return index + 1;
}

/** Outside arithmetic, `(` and `)` end the word and the command, and open or close a subshell. */
function subshell(state: State, char: "(" | ")", index: number): number {
  flush(state);
  state.pieces.push(char);
  return index;
}

function ampersandOrPipe(
  state: State,
  char: string,
  chars: readonly string[],
  index: number,
): number {
  const next = chars[index + 1];
  const last = current(state).at(-1);
  // `2>&1`: the `&` starts the redirection target.
  if (char === "&" && !state.started && last?.operator === true && last.text.endsWith(">")) {
    append(state, char);
    return index;
  }
  if (char === "&" && next === ">") {
    flush(state);
    const doubled = chars[index + 2] === ">";
    current(state).push({ text: doubled ? "&>>" : "&>", operator: true });
    return index + (doubled ? 2 : 1);
  }
  return split(state, next === char ? index + 1 : index);
}

function split(state: State, index: number): number {
  flush(state);
  state.pieces.push([]);
  return index;
}

function append(state: State, text: string): void {
  state.word += text;
  state.started = true;
}

function flush(state: State): void {
  if (state.started) current(state).push({ text: state.word, operator: false });
  reset(state);
}

function reset(state: State): void {
  state.word = "";
  state.started = false;
}

function current(state: State): Token[] {
  const piece = state.pieces.at(-1);
  if (typeof piece === "object") return piece;
  const created: Token[] = [];
  state.pieces.push(created);
  return created;
}
