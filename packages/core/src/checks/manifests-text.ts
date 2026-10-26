// SPDX-License-Identifier: Apache-2.0
import type { Declared } from "./dependencies";

/**
 * Readers of the manifests that are code or plain lines: requirements files, `go.mod`, the
 * Gemfile, `Package.swift` and Gradle's build scripts. Each declaration counts on the line that
 * holds it; comments and options are no dependencies.
 */

/** The line, from 1, of the character at `index`. */
export function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** A Python requirement's name, before its extras, its version and its marker (PEP 508). */
export function requirementName(spec: string): string | undefined {
  return /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(spec)?.[1];
}

/** One requirement a line, without comments, options (`-r`, `-e`) or URLs with no name. */
export function requirements(text: string): Declared[] {
  return numbered(text).flatMap(([line, number]) => {
    const spec = line.replace(/(?:^|\s)#.*$/, "").trim();
    if (spec === "" || spec.startsWith("-") || /^[a-z+]+:\/\//i.test(spec)) return [];
    const name = requirementName(spec);
    return name === undefined ? [] : [{ name, line: number }];
  });
}

/** The modules `go.mod` requires, in one line or in a block, but those it marks `// indirect`. */
export function goMod(text: string): Declared[] {
  let block = false;
  return numbered(text).flatMap(([line, number]): Declared[] => {
    const code = line.replace(/\/\/.*$/, "").trim();
    if (block && code === ")") block = false;
    if (/^require\s*\($/.test(code)) block = true;
    const spec = block ? code : /^require\s+([^(].*)$/.exec(code)?.[1];
    const path = spec?.split(/\s+/)[0];
    if (path === undefined || path === "" || path === "require" || /\/\/\s*indirect\b/.test(line)) {
      return [];
    }
    return [{ name: path, line: number }];
  });
}

/** Each `gem "<name>"` of a Gemfile. */
export function gemfile(text: string): Declared[] {
  return numbered(text).flatMap(([line, number]) => {
    const name = /^\s*gem\s*\(?\s*["']([^"']+)["']/.exec(line)?.[1];
    return name === undefined ? [] : [{ name, line: number }];
  });
}

/** Each `.package(…)` of `Package.swift`, by the last part of its url, its path or its id. */
export function packageSwift(text: string): Declared[] {
  return [...text.matchAll(/\.package\s*\(([^)]*)\)/g)].flatMap((match) => {
    const source = /\b(?:url|path|id)\s*:\s*"([^"]+)"/.exec(match[1] ?? "")?.[1];
    if (source === undefined) return [];
    const name =
      source
        .replace(/\.git$/, "")
        .split("/")
        .pop() ?? source;
    return [{ name, line: lineAt(text, match.index) }];
  });
}

// A `group:artifact[:version]` string in a call (`implementation(…)`, `platform(…)`).
const COORDINATE =
  /\b[a-z]\w*\s*\(?\s*(?:(?:enforced)?[pP]latform\s*\(\s*)?["']([\w.-]+:[\w.-]+)(?::[^"']*)?["']/g;
// Groovy's map notation: `group: 'g', name: 'a'`.
const MAP = /\bgroup\s*[:=]\s*["']([\w.-]+)["']\s*,\s*name\s*[:=]\s*["']([\w.-]+)["']/g;

/** The `group:artifact` coordinates of Gradle's build scripts, in Kotlin and Groovy. */
export function gradleBuild(text: string): Declared[] {
  // A commented-out line declares nothing.
  const code = text.replace(/^\s*\/\/.*$/gm, "");
  const strings = [...code.matchAll(COORDINATE)].map((match) => ({
    name: match[1] ?? "",
    line: lineAt(code, match.index),
  }));
  const maps = [...code.matchAll(MAP)].map((match) => ({
    name: `${match[1] ?? ""}:${match[2] ?? ""}`,
    line: lineAt(code, match.index),
  }));
  return [...strings, ...maps].toSorted((a, b) => a.line - b.line);
}

function numbered(text: string): (readonly [string, number])[] {
  return text.split(/\r?\n/).map((line, index) => [line, index + 1] as const);
}
