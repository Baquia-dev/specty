// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml } from "yaml";
import { lookup } from "../lookup";
import { basename } from "../paths";
import { gemfile, goMod, gradleBuild, packageSwift, requirements } from "./manifests-text";

/**
 * Dependencies a manifest declares, by the catalog of manifests Specty knows. Each reader gives
 * the names a manifest declares, with the line of each when it knows it. Adding an ecosystem
 * means adding its reader here.
 */

/** A dependency a manifest gained, and the line that declares it. */
export interface AddedDependency {
  readonly name: string;
  readonly line?: number;
}

/** A dependency a manifest declares, with its line when the reader knows it. */
export interface Declared {
  readonly name: string;
  readonly line?: number;
}

/** What a manifest declares, or undefined when it cannot be read. */
type Reader = (text: string) => readonly Declared[] | undefined;

const NPM_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const PUB_SECTIONS = ["dependencies", "dev_dependencies"];
const COMPOSER_SECTIONS = ["require", "require-dev"];

const jsonKey = (name: string) => `"${name}"`;
const yamlKey = (name: string) => `${name}:`;

/** PHP itself, its extensions and libraries, and Composer's API: no packages of the registry. */
const isPlatform = (name: string) =>
  name === "php" || /^(?:ext|lib)-/.test(name) || /^composer(?:-plugin|-runtime)?-api$/.test(name);

const READERS: Readonly<Record<string, Reader>> = {
  "package.json": (text) => keyed(text, parseJson(text), NPM_SECTIONS, jsonKey, () => true),
  // The SDK's own packages (`flutter: { sdk: flutter }`) come with Flutter, not from pub.
  "pubspec.yaml": (text) =>
    keyed(text, parseYamlText(text), PUB_SECTIONS, yamlKey, (_, value) => !hasKey(value, "sdk")),
  "composer.json": (text) =>
    keyed(text, parseJson(text), COMPOSER_SECTIONS, jsonKey, (name) => !isPlatform(name)),
  "requirements.txt": requirements,
  "go.mod": goMod,
  Gemfile: gemfile,
  "Package.swift": packageSwift,
  "build.gradle": gradleBuild,
  "build.gradle.kts": gradleBuild,
};

/** Manifests whose names vary: `requirements-dev.txt`. */
const PATTERNS: readonly (readonly [RegExp, Reader])[] = [
  [/^requirements[\w.-]*\.txt$/, requirements],
];

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
  const now = reader(after);
  const then = before === undefined ? [] : reader(before);
  if (now === undefined || then === undefined) return [];
  const known = new Set(then.map((entry) => entry.name));
  return now
    .filter((entry) => !known.has(entry.name))
    .filter((entry, index, all) => all.findIndex((other) => other.name === entry.name) === index)
    .map((entry) =>
      entry.line === undefined ? { name: entry.name } : { name: entry.name, line: entry.line },
    );
}

function readerOf(path: string): Reader | undefined {
  const name = basename(path);
  return lookup(READERS, name) ?? PATTERNS.find(([pattern]) => pattern.test(name))?.[1];
}

/** The entries of a JSON or YAML manifest's `sections`, each on the line its key opens. */
function keyed(
  text: string,
  manifest: unknown,
  sections: readonly string[],
  key: (name: string) => string,
  counts: (name: string, value: unknown) => boolean,
): Declared[] | undefined {
  if (!isObject(manifest)) return undefined;
  const lines = text.split(/\r?\n/);
  return sections.flatMap((section) => {
    const entries = manifest[section];
    if (!isObject(entries)) return [];
    return Object.entries(entries)
      .filter(([name, value]) => counts(name, value))
      .map(([name]) => {
        const line = lineOf(lines, key(section), key(name));
        return line === undefined ? { name } : { name, line };
      });
  });
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
