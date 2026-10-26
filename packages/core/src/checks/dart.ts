// SPDX-License-Identifier: Apache-2.0
import { splitCode } from "./code";

/** A comment that switches Dart's analyzer off: for the line it is on or above, or the file. */
export interface AnalyzerIgnore {
  readonly line: number;
  readonly scope: "line" | "file";
}

// The analyzer only obeys them at the start of a comment: `// ignore: rule`, `// ignore_for_file:`.
const IGNORE = /^\s*ignore(?<file>_for_file)?\s*:/;

export function analyzerIgnores(text: string): AnalyzerIgnore[] {
  return splitCode(text).flatMap((line, index): AnalyzerIgnore[] => {
    const found = line.comments
      .map((comment) => IGNORE.exec(comment))
      .find((match) => match !== null);
    if (found === undefined || found === null) return [];
    return [{ line: index + 1, scope: found.groups?.file === undefined ? "line" : "file" }];
  });
}
