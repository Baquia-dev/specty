// SPDX-License-Identifier: Apache-2.0
import {
  type ConfigEdit,
  type Lang,
  SETTINGS,
  type Setting,
  type SettingChange,
  settingOf,
  settingText,
} from "@baquia-dev/specty-core/light";
import type { DiffPart } from "../data/records";
import type { ConfigRecord } from "../data/source";
import { textAndBefore } from "../data/word-diff";
import { isObject, valueAt, valueItems } from "./settings-view";

// The edits of the settings page: the fields of each setting, what the person writes in them as
// edits of `config.yaml`, those edits applied to the file, and each change as the dialog «Revisar
// y guardar» shows it (pure, like settings-view.ts).

/** How a field is edited: one option, yes or no, a number, a text, one element or entry a line. */
type FieldKind = "choice" | "toggle" | "number" | "text" | "lines" | "entries";

/** A field of a setting: the setting itself, or one key of a group. */
export interface SettingField {
  /** Its keys in `config.yaml`. */
  readonly path: readonly string[];
  /** Its key inside a group; none for the setting itself. */
  readonly label?: string;
  readonly kind: FieldKind;
  /** The values of a choice. */
  readonly options?: readonly string[];
  readonly unit?: string;
  /** What a list holds when it is not texts: numbers. */
  readonly items?: "number";
}

/** An edit of the page: what the person wrote and the edit it makes; «Restablecer» writes nothing. */
export interface Draft {
  readonly text?: string;
  readonly edit: ConfigEdit;
}

/** The page's edits, by their keys with dots, in the order they apply. */
export type Drafts = ReadonlyMap<string, Draft>;

/** The field of each kind of setting that is not a group. */
const FIELD_KINDS: Readonly<Record<Exclude<Setting["kind"], "group">, FieldKind>> = {
  choice: "choice",
  toggle: "toggle",
  number: "number",
  text: "text",
  command: "text",
  list: "lines",
  map: "entries",
};

/**
 * The fields of a setting the UI saves (`settingOf`), none for the rest. A group has one per key
 * of its default and of the file, each by the kind of its value, or one `name: value` per line
 * when its default is empty, like a map.
 */
export function fieldsOf(setting: Setting, record: ConfigRecord): readonly SettingField[] {
  const path = setting.key.split(".");
  if (settingOf(path) === undefined) return [];
  if (setting.kind === "group") return groupFields(path, record);
  return [
    {
      path,
      kind: FIELD_KINDS[setting.kind],
      ...(setting.options === undefined ? {} : { options: setting.options }),
      ...(setting.unit === undefined ? {} : { unit: setting.unit }),
      ...(setting.items === undefined ? {} : { items: setting.items }),
    },
  ];
}

function groupFields(path: readonly string[], record: ConfigRecord): readonly SettingField[] {
  const key = path.join(".");
  const fallback = valueAt(record.defaults, key);
  const own = valueAt(record.input, key);
  const defaults = isObject(fallback) ? fallback : {};
  const file = isObject(own) ? own : {};
  if (Object.keys(defaults).length === 0) return [{ path, kind: "entries" }];
  const names = [...new Set([...Object.keys(defaults), ...Object.keys(file)])];
  return names.map((name) => ({
    path: [...path, name],
    label: name,
    kind: kindOf(defaults[name] ?? file[name]),
  }));
}

function kindOf(value: unknown): FieldKind {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "toggle";
  return Array.isArray(value) ? "lines" : "text";
}

/** A field's text: as the person wrote it or, else, its value with the edits, or its default. */
export function fieldText(field: SettingField, record: ConfigRecord, drafts: Drafts): string {
  const key = field.path.join(".");
  const written = drafts.get(key)?.text;
  if (written !== undefined) return written;
  const edited = valueAt(applyEdits(record.input, editsOf(drafts)), key);
  const value = edited ?? valueAt(record.defaults, key);
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (isObject(value)) {
    return Object.entries(value)
      .map(([name, item]) => `${name}: ${String(item)}`)
      .join("\n");
  }
  return String(value);
}

/** What the person wrote in a field, as the edit it makes; an empty number or text removes its key. */
export function draftOf(field: SettingField, text: string): Draft {
  const value = valueWritten(field, text);
  return { text, edit: value === undefined ? { path: field.path } : { path: field.path, value } };
}

function valueWritten(field: SettingField, text: string): unknown {
  const trimmed = text.trim();
  switch (field.kind) {
    case "choice":
      return text;
    case "toggle":
      return text === "true";
    case "number":
      return trimmed === "" ? undefined : scalar(trimmed);
    case "text":
      return trimmed === "" ? undefined : trimmed;
    case "lines":
      return linesOf(text).map((line) => (field.items === "number" ? scalar(line) : line));
    case "entries":
      return Object.fromEntries(linesOf(text).map(entryOf));
  }
}

/** A number, yes or no as `true` and `false`, or else the text, for the validator to judge. */
function scalar(text: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === "true" || text === "false") return text === "true";
  return text;
}

function linesOf(text: string): readonly string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function entryOf(line: string): readonly [string, string] {
  const colon = line.indexOf(":");
  if (colon < 0) return [line, ""];
  return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
}

/** «Restablecer» on a setting: its key leaves the file, and its fields show the default. */
export function resetDraft(setting: Setting): Draft {
  return { edit: { path: setting.key.split(".") } };
}

/**
 * The edits with `draft`: in the place of one with its keys, or last. One that removes a key drops
 * the edits inside it, which it would undo.
 */
export function withDraft(drafts: Drafts, draft: Draft): Drafts {
  const key = draft.edit.path.join(".");
  const next = new Map(drafts);
  if (draft.edit.value === undefined) {
    for (const other of drafts.keys()) {
      if (other === key || other.startsWith(`${key}.`)) next.delete(other);
    }
  }
  return next.set(key, draft);
}

export function editsOf(drafts: Drafts): readonly ConfigEdit[] {
  return [...drafts.values()].map((draft) => draft.edit);
}

/**
 * The file's entry with the edits applied in their order: each value at its keys, with the maps it
 * needs, or its key removed, with the maps it empties. The rest keeps its order; nothing changes
 * in place.
 */
export function applyEdits(input: unknown, edits: readonly ConfigEdit[]): unknown {
  return edits.reduce((current, edit) => applied(current, edit.path, edit.value), input);
}

function applied(map: unknown, path: readonly string[], value: unknown): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return map;
  const entries = Object.entries(isObject(map) ? map : {});
  const old = entries.find(([name]) => name === key)?.[1];
  const next = rest.length === 0 ? value : applied(old, rest, value);
  const kept = entries.filter(([name]) => name !== key);
  const emptied = rest.length > 0 && isObject(next) && Object.keys(next).length === 0;
  if (next === undefined || emptied) return Object.fromEntries(kept);
  if (kept.length === entries.length) return Object.fromEntries([...entries, [key, next]]);
  return Object.fromEntries(entries.map(([name, item]) => [name, name === key ? next : item]));
}

/** A change as the dialog «Revisar y guardar» shows it. */
export interface ChangeLine {
  readonly key: string;
  readonly setting: Setting;
  readonly name: string;
  /** The new value, with what was added marked. */
  readonly text: readonly DiffPart[];
  /** The old value, with what was removed marked; only when something was removed. */
  readonly before?: readonly DiffPart[];
  /** The key leaves the file: the setting goes back to its default. */
  readonly reset: boolean;
}

/**
 * Each change in words: its values are the file's or, without the key, the default's (a group's,
 * the file's keys over the default's). A text or a command compares by words; any other value, by
 * its elements, and a single one replaced is removed.
 */
export function changeLines(
  changes: readonly SettingChange[],
  record: ConfigRecord,
  lang: Lang,
): readonly ChangeLine[] {
  return changes.flatMap((change) => {
    const setting = SETTINGS.find((candidate) => candidate.key === change.key);
    if (setting === undefined) return [];
    const fallback = valueAt(record.defaults, change.key);
    const old = shown(change.before, fallback);
    const now = valueItems(shown(change.after, fallback), setting, lang);
    const diff = diffOf(old === undefined ? [] : valueItems(old, setting, lang), now, setting);
    return [
      {
        key: change.key,
        setting,
        name: settingText(change.key, lang).name,
        ...diff,
        reset: change.after === undefined,
      },
    ];
  });
}

function shown(value: unknown, fallback: unknown): unknown {
  if (value === undefined) return fallback;
  return isObject(value) && isObject(fallback) ? { ...fallback, ...value } : value;
}

function diffOf(
  old: readonly string[],
  now: readonly string[],
  setting: Setting,
): { readonly text: readonly DiffPart[]; readonly before?: readonly DiffPart[] } {
  const words = setting.kind === "text" || setting.kind === "command";
  if (words && old.length === 1 && now.length === 1)
    return textAndBefore(old[0] ?? "", now[0] ?? "");
  const text = joined(now.map((item) => marked(item, !old.includes(item), "added")));
  if (old.every((item) => now.includes(item))) return { text };
  return { text, before: joined(old.map((item) => marked(item, !now.includes(item), "removed"))) };
}

function marked(text: string, changed: boolean, change: "added" | "removed"): DiffPart {
  return changed ? { text, change } : { text };
}

/** The elements one after another, with a comma between them. */
function joined(parts: readonly DiffPart[]): readonly DiffPart[] {
  return parts.flatMap((part, index) => (index === 0 ? [part] : [{ text: ", " }, part]));
}
