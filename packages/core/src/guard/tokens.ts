// SPDX-License-Identifier: Apache-2.0

export interface Token {
  readonly text: string;
  /** Redirection (`>`, `>>`, `2>`, `&>`, `<`) rather than a word. */
  readonly operator: boolean;
}

interface State {
  readonly segments: Token[][];
  word: string;
  started: boolean;
  quote: '"' | "'" | undefined;
}

/**
 * Splits a shell command into simple commands (`;`, `&&`, `||`, `|`, `&`, newlines) made of
 * words and redirections. Best effort: enough to read intent, not a full shell grammar.
 */
export function tokenize(command: string): Token[][] {
  const state: State = { segments: [[]], word: "", started: false, quote: undefined };
  const chars = [...command];
  for (let index = 0; index < chars.length; index++) {
    index = step(state, chars, index);
  }
  flush(state);
  return state.segments.filter((segment) => segment.length > 0);
}

function step(state: State, chars: readonly string[], index: number): number {
  const char = chars[index] ?? "";
  const next = chars[index + 1];
  if (state.quote !== undefined) return quoted(state, char, next, index);
  if (char === "'" || char === '"') {
    state.quote = char;
    state.started = true;
    return index;
  }
  if (char === "\\" && next !== undefined) {
    append(state, next);
    return index + 1;
  }
  if (char === " " || char === "\t") {
    flush(state);
    return index;
  }
  if (char === "\n" || char === ";") return split(state, index);
  if (char === ">") return redirect(state, next, index);
  if (char === "<") {
    flush(state);
    current(state).push({ text: "<", operator: true });
    return index;
  }
  if (char === "&" || char === "|") return ampersandOrPipe(state, char, chars, index);
  append(state, char);
  return index;
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
  state.segments.push([]);
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
  const segment = state.segments.at(-1);
  if (segment !== undefined) return segment;
  const created: Token[] = [];
  state.segments.push(created);
  return created;
}
