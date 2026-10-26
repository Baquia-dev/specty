// SPDX-License-Identifier: Apache-2.0

/**
 * How `specty check` measures a function once an estimator has found it, whatever the language:
 * its lines of code and its cyclomatic complexity, without the branches of the functions inside.
 */

export interface FunctionMetric {
  /** Its name, when the header gives one. */
  readonly name?: string;
  /** The line of its header, from 1; the first one when the header takes several. */
  readonly start: number;
  /** The line where it ends. */
  readonly end: number;
  /** Lines of code from the header to its end, without blanks or comments. */
  readonly lines: number;
  /** 1 plus each branch, without the ones of the functions inside it. */
  readonly complexity: number;
}

/** A function an estimator found: its name and its first and last lines, as indices from 0. */
export interface Span {
  readonly name?: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The metrics of each span, over the code of each line (`""` for a line with none) and the
 * pattern of a branch, which must be global.
 */
export function measure(
  lines: readonly string[],
  spans: readonly Span[],
  branches: RegExp,
): FunctionMetric[] {
  return spans.map((span) => {
    const inner = spans.filter(
      (other) => other !== span && other.start > span.start && other.end <= span.end,
    );
    const own = (index: number) =>
      !inner.some((other) => index >= other.start && index <= other.end);
    let code = 0;
    let count = 0;
    for (let index = span.start; index <= span.end; index += 1) {
      const line = lines[index] ?? "";
      if (line !== "") code += 1;
      if (own(index)) count += line.match(branches)?.length ?? 0;
    }
    return {
      ...(span.name !== undefined ? { name: span.name } : {}),
      start: span.start + 1,
      end: span.end + 1,
      lines: code,
      complexity: 1 + count,
    };
  });
}
