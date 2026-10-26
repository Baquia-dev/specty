// SPDX-License-Identifier: Apache-2.0
import type { Declared } from "./dependencies";
import { requirementName } from "./manifests-text";

/**
 * Readers of the TOML manifests: `pyproject.toml`, `Cargo.toml` and Gradle's version catalog. Not
 * a TOML parser, but what they need of one: each `key = value` with its table and its line, a
 * value that goes on across lines while an array is open, and the strings of an array outside its
 * inline tables.
 */

interface Entry {
  /** The `[table]` the entry is in; `""` before the first. */
  readonly table: string;
  readonly key: string;
  readonly value: string;
  readonly line: number;
  /** The strings of the value outside inline tables, with their lines. */
  readonly strings: readonly { readonly text: string; readonly line: number }[];
}

interface Table {
  readonly name: string;
  readonly line: number;
}

interface Scan {
  readonly entries: readonly Entry[];
  readonly tables: readonly Table[];
}

const HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$/;
const PAIR = /^\s*("[^"]*"|'[^']*'|[\w.-]+)\s*=\s*(.*)$/;

function scan(text: string): Scan {
  const lines = text.split(/\r?\n/).map(withoutComment);
  const entries: Entry[] = [];
  const tables: Table[] = [];
  let table = "";
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const header = HEADER.exec(line)?.[1];
    if (header !== undefined) {
      table = header;
      tables.push({ name: header, line: index + 1 });
    }
    const pair = header === undefined ? PAIR.exec(line) : null;
    const end = pair === null ? index : closing(lines, index);
    if (pair !== null) entries.push(entryOf(table, unquote(pair[1] ?? ""), lines, index, end));
    index = end + 1;
  }
  return { entries, tables };
}

function entryOf(
  table: string,
  key: string,
  lines: readonly string[],
  start: number,
  end: number,
): Entry {
  const own = lines.slice(start, end + 1);
  const first = own[0] ?? "";
  const value = [first.slice(first.indexOf("=") + 1), ...own.slice(1)].join("\n");
  const strings = value.split("\n").flatMap((part, offset) => stringsOf(part, start + offset + 1));
  return { table, key, value, line: start + 1, strings };
}

/** The last line of a value that starts on `start`: where its arrays close. */
function closing(lines: readonly string[], start: number): number {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    depth += balance(lines[index] ?? "");
    if (depth <= 0) return index;
  }
  return lines.length - 1;
}

/** Opened minus closed brackets, out of strings. */
function balance(line: string): number {
  const code = line.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, "");
  return (code.match(/\[/g)?.length ?? 0) - (code.match(/\]/g)?.length ?? 0);
}

/** The strings of a line, out of its inline tables (`{ include-group = "…" }`). */
function stringsOf(line: string, number: number): { text: string; line: number }[] {
  const outside = line.replace(/\{[^{}]*\}/g, "");
  return [...outside.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((match) => ({
    text: match[1] ?? match[2] ?? "",
    line: number,
  }));
}

/** The line without its `#` comment, out of strings. */
function withoutComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quote === undefined && char === "#") return line.slice(0, index);
    if (quote === undefined && (char === '"' || char === "'")) quote = char;
    else if (char === quote) quote = undefined;
  }
  return line;
}

function unquote(key: string): string {
  return /^(["']).*\1$/.test(key) ? key.slice(1, -1) : key;
}

const POETRY = /^tool\.poetry\.(?:dependencies|dev-dependencies|group\.[^.]+\.dependencies)$/;

/** PEP 621's dependencies and extras, PEP 735's groups and Poetry's tables, but `python`. */
export function pyproject(text: string): Declared[] {
  return scan(text).entries.flatMap((entry): Declared[] => {
    if (isRequirementList(entry)) return requirementsOf(entry);
    if (POETRY.test(entry.table) && entry.key !== "python") {
      return [{ name: entry.key, line: entry.line }];
    }
    return [];
  });
}

function isRequirementList({ table, key }: Entry): boolean {
  if (table === "project") return key === "dependencies";
  return table === "project.optional-dependencies" || table === "dependency-groups";
}

function requirementsOf(entry: Entry): Declared[] {
  return entry.strings.flatMap((string) => {
    const name = requirementName(string.text);
    return name === undefined ? [] : [{ name, line: string.line }];
  });
}

const CARGO_TABLE = /^(?:workspace\.|target\..+\.)?(?:dev-|build-)?dependencies$/;
const CARGO_HEADER = /^(?:workspace\.|target\..+\.)?(?:dev-|build-)?dependencies\.(.+)$/;

/** Every dependency table of Cargo, by its keys (`clap.workspace = true` is `clap`) or headers. */
export function cargo(text: string): Declared[] {
  const { entries, tables } = scan(text);
  const keyed = entries
    .filter((entry) => CARGO_TABLE.test(entry.table))
    .map((entry) => ({ name: entry.key.split(".")[0] ?? entry.key, line: entry.line }));
  const headed = tables.flatMap((table) => {
    const name = CARGO_HEADER.exec(table.name)?.[1];
    return name === undefined ? [] : [{ name: unquote(name), line: table.line }];
  });
  return [...keyed, ...headed].toSorted((a, b) => a.line - b.line);
}

/** The libraries of Gradle's version catalog, as `group:artifact`. */
export function versionCatalog(text: string): Declared[] {
  return scan(text)
    .entries.filter((entry) => entry.table === "libraries")
    .flatMap((entry) => {
      const name = coordinateOf(entry.value);
      return name === undefined ? [] : [{ name, line: entry.line }];
    });
}

/** By `module`, by `group` and `name`, or by the string itself. */
function coordinateOf(value: string): string | undefined {
  const module = /\bmodule\s*=\s*"([^"]+)"/.exec(value)?.[1];
  const group = /\bgroup\s*=\s*"([^"]+)"/.exec(value)?.[1];
  const name = /\bname\s*=\s*"([^"]+)"/.exec(value)?.[1];
  const plain = /^\s*"([\w.-]+:[\w.-]+)(?::[^"]*)?"/.exec(value)?.[1];
  return module ?? (group !== undefined && name !== undefined ? `${group}:${name}` : plain);
}
