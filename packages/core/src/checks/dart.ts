// SPDX-License-Identifier: Apache-2.0
import { dirname } from "../paths";
import { splitCode } from "./code";
import type { ResolvedImport } from "./layers";

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

const DIRECTIVE = /^\s*(?:import|export)\b/;
const URI = /^\s*(?:import|export)\s+(['"])([^'"]+)\1/;

/**
 * The imports and exports of a Dart file, resolved for the layers: `package:` of `own` (the
 * pubspec's name) is the file under `lib/`, another `package:` is that package, `dart:io` is the
 * package `dart:io`, and a relative URI is a file next to this one. A conditional import counts
 * by its main URI; a `part` is the same library, not an import.
 */
export function dartImports(path: string, text: string, own: string | undefined): ResolvedImport[] {
  const lines = text.split(/\r?\n/);
  return splitCode(text).flatMap((line, index): ResolvedImport[] => {
    // A directive starts a line of code; the URI is read from the line as written.
    if (!DIRECTIVE.test(line.code)) return [];
    const uri = URI.exec(lines[index] ?? "")?.[2];
    return uri === undefined ? [] : [resolved(path, uri, own)];
  });
}

function resolved(from: string, specifier: string, own: string | undefined): ResolvedImport {
  if (specifier.startsWith("dart:")) {
    return { from, specifier, package: specifier.split("/")[0] ?? specifier };
  }
  if (specifier.startsWith("package:")) {
    const [name, ...rest] = specifier.slice("package:".length).split("/");
    if (own !== undefined && name === own) {
      return { from, specifier, target: ["lib", ...rest].join("/") };
    }
    return { from, specifier, package: name ?? specifier };
  }
  return { from, specifier, target: joined(dirname(from), specifier) };
}

/** `relative` from the folder `base`, with its `.` and `..` resolved. */
function joined(base: string, relative: string): string {
  const parts: string[] = base === "" ? [] : base.split("/");
  for (const segment of relative.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/");
}
