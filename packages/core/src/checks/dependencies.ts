// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml } from "yaml";
import { lookup } from "../lookup";
import { basename } from "../paths";

/**
 * Dependencies a manifest declares, by the catalog of manifests Specty knows. Each reader gives
 * the names of a manifest's sections; the line comes from the text, so a reader stays a few
 * lines. Adding an ecosystem means adding its reader here.
 */

/** A dependency a manifest gained, and the line that declares it. */
export interface AddedDependency {
  readonly name: string;
  readonly line?: number;
}

interface Declared {
  readonly name: string;
  readonly section: string;
}

interface Reader {
  /** The text of the key that opens a section and of the key of an entry: `"name"` or `name:`. */
  readonly key: (name: string) => string;
  /** What the manifest declares, or undefined when it cannot be read. */
  readonly read: (text: string) => readonly Declared[] | undefined;
}

const NPM_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const PUB_SECTIONS = ["dependencies", "dev_dependencies"];

const READERS: Readonly<Record<string, Reader>> = {
  "package.json": {
    key: (name) => `"${name}"`,
    read: (text) => sectionsOf(parseJson(text), NPM_SECTIONS, () => true),
  },
  // The SDK's own packages (`flutter: { sdk: flutter }`) come with Flutter, not from pub.
  "pubspec.yaml": {
    key: (name) => `${name}:`,
    read: (text) => sectionsOf(parseYamlText(text), PUB_SECTIONS, (value) => !hasKey(value, "sdk")),
  },
};

/** True when `path` is a manifest Specty knows how to read, in any folder. */
export function readsDependencies(path: string): boolean {
  return readerOf(path) !== undefined;
}

/**
 * The dependencies `after` declares and `before` did not, in the order `after` declares them; a
 * new manifest (`before` undefined) declares them all. A manifest that cannot be read, before or
 * after, gives none: its own tools report it.
 */
export function addedDependencies(
  path: string,
  before: string | undefined,
  after: string,
): AddedDependency[] {
  const reader = readerOf(path);
  if (reader === undefined) return [];
  const now = reader.read(after);
  const then = before === undefined ? [] : reader.read(before);
  if (now === undefined || then === undefined) return [];
  const known = new Set(then.map((entry) => entry.name));
  const lines = after.split(/\r?\n/);
  return now
    .filter((entry) => !known.has(entry.name))
    .filter((entry, index, all) => all.findIndex((other) => other.name === entry.name) === index)
    .map((entry) => {
      const line = lineOf(lines, reader.key(entry.section), reader.key(entry.name));
      return line === undefined ? { name: entry.name } : { name: entry.name, line };
    });
}

function readerOf(path: string): Reader | undefined {
  return lookup(READERS, basename(path));
}

/** The first line that opens `entry` after the one that opens `section`, from 1. */
function lineOf(lines: readonly string[], section: string, entry: string): number | undefined {
  const start = lines.findIndex((line) => line.trimStart().startsWith(section));
  if (start === -1) return undefined;
  const found = lines.findIndex(
    (line, index) => index > start && line.trimStart().startsWith(entry),
  );
  return found === -1 ? undefined : found + 1;
}

function sectionsOf(
  manifest: unknown,
  sections: readonly string[],
  counts: (value: unknown) => boolean,
): Declared[] | undefined {
  if (!isObject(manifest)) return undefined;
  return sections.flatMap((section) => {
    const entries = manifest[section];
    if (!isObject(entries)) return [];
    return Object.entries(entries)
      .filter(([, value]) => counts(value))
      .map(([name]) => ({ name, section }));
  });
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

function parseYamlText(text: string): unknown {
  try {
    const value: unknown = parseYaml(text);
    return value;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasKey(value: unknown, key: string): boolean {
  return isObject(value) && key in value;
}
