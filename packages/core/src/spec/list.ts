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
    if (fenced) {
      problems.push({ kind: "fenced", line });
      continue;
    }
    const top = TOP_BULLET.exec(text);
    if (top !== null) {
      items.push({ head: (top[1] ?? "").trim(), line, fields: [] });
      continue;
    }
    const current = items.at(-1);
    const sub = SUB_BULLET.exec(text);
    if (sub !== null && current !== undefined) {
      const field = FIELD.exec((sub[1] ?? "").trim());
      if (field === null) problems.push({ kind: "bad-field", line });
      else current.fields.push({ key: field[1] ?? "", value: (field[2] ?? "").trim(), line });
      continue;
    }
    if (INDENTED_TEXT.test(text) && current !== undefined) {
      appendContinuation(current, text.trim());
      continue;
    }
    problems.push({ kind: "not-list", line });
  }
  return { items, problems };
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
