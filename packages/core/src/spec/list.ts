// SPDX-License-Identifier: Apache-2.0
import type { SourceLine } from "./source";

export interface RawField {
  readonly key: string;
  readonly value: string;
  readonly line: number;
}

/** A top-level `- …` item with its indented `- key: value` fields. */
export interface RawItem {
  readonly head: string;
  readonly line: number;
  readonly fields: readonly RawField[];
}

interface ListProblem {
  readonly kind: "not-list" | "fenced" | "bad-field";
  readonly line: number;
}

export interface RawList {
  readonly items: readonly RawItem[];
  readonly problems: readonly ListProblem[];
}

const TOP_BULLET = /^[-*+][ \t]+(.*)$/;
const SUB_BULLET = /^[ \t]+[-*+][ \t]+(.*)$/;
const INDENTED_TEXT = /^[ \t]+\S/;
const FIELD = /^([A-Za-z][A-Za-z-]*)[ \t]*:[ \t]*(.*)$/;

interface ItemBuilder {
  head: string;
  readonly line: number;
  readonly fields: { readonly key: string; value: string; readonly line: number }[];
}

/**
 * Reads a structured section. Items start at column 0; indented bullets are fields and
 * other indented text continues the previous item or field.
 */
export function readList(body: readonly SourceLine[]): RawList {
  const items: ItemBuilder[] = [];
  const problems: ListProblem[] = [];
  for (const { text, line, fenced } of body) {
    if (text.trim() === "") continue;
    const current = items.at(-1);
    const read: LineRead = fenced ? { kind: "fenced" } : readLine(text, current !== undefined);
    switch (read.kind) {
      case "item":
        items.push({ head: read.head, line, fields: [] });
        break;
      case "field":
        current?.fields.push({ key: read.key, value: read.value, line });
        break;
      case "continuation":
        if (current !== undefined) appendContinuation(current, read.text);
        break;
      default:
        problems.push({ kind: read.kind, line });
    }
  }
  return { items, problems };
}

/** What a line of a structured section is: an item, a field, a continuation or a problem. */
type LineRead =
  | { readonly kind: "item"; readonly head: string }
  | { readonly kind: "field"; readonly key: string; readonly value: string }
  | { readonly kind: "continuation"; readonly text: string }
  | { readonly kind: ListProblem["kind"] };

/** Reads one line; fields and continuations need an item before them (`inItem`). */
function readLine(text: string, inItem: boolean): LineRead {
  const top = TOP_BULLET.exec(text);
  if (top !== null) return { kind: "item", head: (top[1] ?? "").trim() };
  const sub = SUB_BULLET.exec(text);
  if (sub !== null && inItem) return fieldOf(sub[1] ?? "");
  if (INDENTED_TEXT.test(text) && inItem) return { kind: "continuation", text: text.trim() };
  return { kind: "not-list" };
}

/** An indented bullet: a `key: value` field, or a bad one. */
function fieldOf(text: string): LineRead {
  const field = FIELD.exec(text.trim());
  if (field === null) return { kind: "bad-field" };
  return { kind: "field", key: field[1] ?? "", value: (field[2] ?? "").trim() };
}

function appendContinuation(item: ItemBuilder, text: string): void {
  const field = item.fields.at(-1);
  if (field !== undefined) field.value = `${field.value} ${text}`.trim();
  else item.head = `${item.head} ${text}`.trim();
}

/** Splits `a, b, c` on commas outside backticks. */
export function splitList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === "`") quoted = !quoted;
    if (char === "," && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Removes backticks that wrap the whole value: `` `flutter test` `` → `flutter test`. */
export function unwrapCode(value: string): string {
  const match = /^`([^`]+)`$/.exec(value.trim());
  return match?.[1]?.trim() ?? value.trim();
}
