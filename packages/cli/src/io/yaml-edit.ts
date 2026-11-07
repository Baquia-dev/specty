// SPDX-License-Identifier: Apache-2.0
import type { ConfigEdit } from "@baquia-dev/specty-core/light";
import {
  isMap,
  isNode,
  isScalar,
  type Pair,
  parse,
  parseDocument,
  Scalar,
  type YAMLMap,
} from "yaml";

// Edits keys of a YAML text in place (formats.md §6): `parseDocument` finds each key and only its
// text changes, so comments, quotes and lists over several lines stay byte for byte, which
// `Document.toString()` would rewrite.

export type YamlEdited =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly issue: { readonly path: string; readonly message: string } };

/** The text with each edit applied in order, or the issue of the first one it cannot apply. */
export function editYaml(text: string, edits: readonly ConfigEdit[]): YamlEdited {
  let current = text;
  for (const edit of edits) {
    const result = applyEdit(current, edit);
    if (!result.ok) return result;
    current = result.text;
  }
  return { ok: true, text: current };
}

/** A map on the way to the edited key and the pair of that map the way goes through. */
interface Step {
  readonly map: YAMLMap;
  readonly pair: Pair;
}

/**
 * Where the way to a key ends: at its pair, with every step there; at a map that lacks the key
 * `path[index]` (none for the root); or at a key `path[index - 1]` that holds no map.
 */
type Walked =
  | { readonly kind: "found"; readonly steps: readonly Step[] }
  | { readonly kind: "missing"; readonly map: YAMLMap | null; readonly index: number }
  | { readonly kind: "not-map"; readonly index: number };

/** One edit: a new value where the key is, a new key where it is not, or a key taken out. */
function applyEdit(text: string, edit: ConfigEdit): YamlEdited {
  const { path, value } = edit;
  const walked = walk(parseDocument(text).contents, path);
  if (walked.kind === "found") {
    const edited =
      value === undefined ? removed(text, walked.steps) : replaced(text, walked.steps, value);
    return { ok: true, text: edited };
  }
  if (value === undefined) return { ok: true, text };
  if (walked.kind === "not-map") return notMap(path, walked.index);
  return { ok: true, text: inserted(text, walked.map, path.slice(walked.index), value) };
}

/** Follows `path` from the document's root through its maps. */
function walk(root: unknown, path: readonly string[]): Walked {
  if (root !== null && !isMap(root)) return { kind: "not-map", index: 0 };
  const steps: Step[] = [];
  let map: YAMLMap | null = root;
  for (const [index, key] of path.entries()) {
    const pair = map === null ? undefined : pairOf(map, key);
    if (map === null || pair === undefined) return { kind: "missing", map, index };
    steps.push({ map, pair });
    if (index < path.length - 1 && !isMap(pair.value)) return { kind: "not-map", index: index + 1 };
    if (isMap(pair.value)) map = pair.value;
  }
  return { kind: "found", steps };
}

/** The issue of an edit whose key `path[index - 1]`, on its way, holds no map. */
function notMap(path: readonly string[], index: number): YamlEdited {
  const at = index === 0 ? "the file" : `\`${path.slice(0, index).join(".")}\``;
  return { ok: false, issue: { path: path.join("."), message: `${at} is not a map.` } };
}

function pairOf(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((pair) => (isScalar(pair.key) ? pair.key.value : pair.key) === key);
}

/** The text with the value of the last step's pair replaced by `value`, written on one line. */
function replaced(text: string, steps: readonly Step[], value: unknown): string {
  const last = steps.at(-1);
  const node = last?.pair.value;
  if (last === undefined || !isNode(node) || !node.range) return text;
  const [start, end] = node.range;
  const quoted = isScalar(node) && node.type !== Scalar.PLAIN && node.type !== undefined;
  const indent = columnOf(text, keyStart(last.pair) ?? start);
  const shown = written(value, indent, quoted);
  // A value in blocks ends with its line break; the one written on its lines keeps it.
  const tail = text.slice(start, end).endsWith("\n") && !shown.endsWith("\n") ? "\n" : "";
  return `${text.slice(0, start)}${shown}${tail}${text.slice(end)}`;
}

/**
 * The text with the last step's key taken out, and with it each map left empty: its lines, from
 * the key to the end of its value's last line; in a flow map, the map written again without it.
 */
function removed(text: string, steps: readonly Step[]): string {
  let index = steps.length - 1;
  while (index > 0 && steps[index]?.map.items.length === 1) index--;
  const step = steps[index];
  if (step === undefined) return text;
  if (step.map.flow === true) {
    const rest = step.map.items.filter((pair) => pair !== step.pair);
    return withFlowMap(text, step.map, entriesOf(rest));
  }
  const start = lineStart(text, keyStart(step.pair) ?? 0);
  return `${text.slice(0, start)}${text.slice(pairEnd(text, step.pair))}`;
}

/**
 * The text with `keys` and `value` added to `map`: after its last key for a map in blocks, the
 * root's included; in a flow map written again with it; at the end of an empty file (none).
 */
function inserted(
  text: string,
  map: YAMLMap | null,
  keys: readonly string[],
  value: unknown,
): string {
  const [key = "", ...rest] = keys;
  if (map?.flow === true) {
    return withFlowMap(text, map, [...entriesOf(map.items), [key, nested(rest, value)]]);
  }
  const last = map?.items.at(-1);
  const first = map?.items[0];
  if (map === null || last === undefined) {
    const separator = text === "" || text.endsWith("\n") ? "" : "\n";
    return `${text}${separator}${blockLines(keys, value, 0)}`;
  }
  const at = pairEnd(text, last);
  const indent = columnOf(text, (first === undefined ? undefined : keyStart(first)) ?? at);
  const separator = text.slice(0, at).endsWith("\n") ? "" : "\n";
  return `${text.slice(0, at)}${separator}${blockLines(keys, value, indent)}${text.slice(at)}`;
}

/** `keys` as maps in blocks, one inside the other, with `value` at the last one. */
function blockLines(keys: readonly string[], value: unknown, indent: number): string {
  const [key, ...rest] = keys;
  const pad = " ".repeat(indent);
  if (rest.length === 0) return `${pad}${keyText(key ?? "")}: ${written(value, indent, false)}\n`;
  return `${pad}${keyText(key ?? "")}:\n${blockLines(rest, value, indent + 2)}`;
}

/** `value` inside maps named by `keys`, outermost first. */
function nested(keys: readonly string[], value: unknown): unknown {
  return keys.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value);
}

/** The pairs of a map as keys and plain values. */
function entriesOf(pairs: readonly Pair[]): [string, unknown][] {
  return pairs.map((pair) => [
    String(isScalar(pair.key) ? pair.key.value : pair.key),
    isNode(pair.value) ? pair.value.toJSON() : pair.value,
  ]);
}

/** The text with the flow map `map` written again, on one line, with `entries`. */
function withFlowMap(text: string, map: YAMLMap, entries: readonly [string, unknown][]): string {
  const [start, end] = map.range ?? [0, 0];
  return `${text.slice(0, start)}${flowText(Object.fromEntries(entries))}${text.slice(end)}`;
}

/**
 * A value as it goes after its key: a text of several lines as a literal block, indented under
 * the key at `indent`; lists and maps in flow; a text as it was quoted, or plain when YAML reads
 * it back the same.
 */
function written(value: unknown, indent: number, quoted: boolean): string {
  if (typeof value === "string" && value.includes("\n")) return literalBlock(value, indent + 2);
  if (typeof value === "string") return quoted || !isPlain(value) ? JSON.stringify(value) : value;
  return flowText(value);
}

/** A text of several lines as a literal block: `|` keeps its last line break, `|-` has none. */
function literalBlock(value: string, indent: number): string {
  const keep = value.endsWith("\n");
  const pad = " ".repeat(indent);
  const lines = (keep ? value.slice(0, -1) : value).split("\n");
  return `${keep ? "|" : "|-"}\n${lines.map((line) => (line === "" ? "" : `${pad}${line}`)).join("\n")}`;
}

/** A value in flow, on one line: texts always quoted, as JSON. */
function flowText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(flowText).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([key, inner]) => `${keyText(key)}: ${flowText(inner)}`).join(", ")} }`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

/** A key plain when YAML reads it back the same, quoted otherwise. */
function keyText(key: string): string {
  return isPlain(key) ? key : JSON.stringify(key);
}

/** Whether YAML reads the text back the same written without quotes, on one line. */
function isPlain(value: string): boolean {
  if (value === "" || value.trim() !== value || value.includes("\n")) return false;
  try {
    return parse(value) === value;
  } catch {
    return false;
  }
}

/** Where a pair's key starts in the text. */
function keyStart(pair: Pair): number | undefined {
  return isNode(pair.key) ? pair.key.range?.[0] : undefined;
}

/** Where a pair ends: after its value's last line, its line break included. */
function pairEnd(text: string, pair: Pair): number {
  const end = (isNode(pair.value) ? pair.value.range?.[1] : undefined) ?? keyStart(pair) ?? 0;
  if (end > 0 && text[end - 1] === "\n") return end;
  const next = text.indexOf("\n", end);
  return next === -1 ? text.length : next + 1;
}

function lineStart(text: string, at: number): number {
  return text.lastIndexOf("\n", at - 1) + 1;
}

function columnOf(text: string, at: number): number {
  return at - lineStart(text, at);
}
