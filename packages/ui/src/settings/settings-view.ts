// SPDX-License-Identifier: Apache-2.0
import type { ConfigIssue } from "@baquia-dev/specty-core";
import {
  fold,
  type Lang,
  optionName,
  SETTING_SECTIONS,
  SETTINGS,
  type Setting,
  type SettingSection,
  sectionName,
  settingText,
  translator,
} from "@baquia-dev/specty-core/light";
import type { ConfigRecord } from "../data/source";

// The settings page: each setting of core's catalog with its value and its default in words,
// whether it changed and its issues, and what the toolbar's search and filter leave (pure, like
// memory-view.ts).

/** The toolbar's filters: every setting, those that changed, or those with a mark. */
export const SETTING_FILTERS = ["all", "modified", "permissions", "command", "new"] as const;
export type SettingFilter = (typeof SETTING_FILTERS)[number];

/** A value in words: its elements (one for a single value) and how many more a long list has. */
export interface ValueWords {
  readonly items: readonly string[];
  readonly more: number;
}

/** A setting as its row shows it. */
export interface SettingRow {
  readonly setting: Setting;
  readonly name: string;
  readonly description: string;
  readonly value: ValueWords;
  /** Its default, only when the value differs from it. */
  readonly default?: ValueWords;
  /** The validator's issues at its key, with the rest of their key before the message. */
  readonly issues: readonly string[];
}

export interface SettingsSection {
  readonly key: SettingSection;
  readonly name: string;
  readonly rows: readonly SettingRow[];
}

type Translate = (es: string, en: string) => string;

/** The elements of a list shown before «y N más». */
const SHOWN = 6;

/**
 * Each setting of the catalog as its row shows it. Its value is the one Specty uses or, with a
 * file that is not valid, the file's, or else the default; delegated mode, the clone's (`delegated`,
 * undefined when the source cannot tell).
 */
export function settingRows(
  record: ConfigRecord,
  delegated: boolean | undefined,
  lang: Lang,
): readonly SettingRow[] {
  const t = translator(lang);
  return SETTINGS.map((setting) => {
    const value =
      setting.clone === true
        ? delegated
        : (at(record.config, setting.key) ??
          at(record.input, setting.key) ??
          at(record.defaults, setting.key));
    const fallback =
      setting.clone === true
        ? delegated === undefined
          ? undefined
          : false
        : at(record.defaults, setting.key);
    const modified = JSON.stringify(value) !== JSON.stringify(fallback);
    return {
      setting,
      ...settingText(setting.key, lang),
      value: words(value, setting, t, lang),
      ...(modified ? { default: words(fallback, setting, t, lang) } : {}),
      issues: issuesAt(setting, record.issues),
    };
  });
}

/** The issues of no setting, such as an unknown key or a file that is not YAML, as `key: message`. */
export function looseIssues(record: ConfigRecord): readonly string[] {
  return record.issues
    .filter((issue) => !SETTINGS.some((setting) => covers(setting, issue)))
    .map(({ path, message }) => (path === "" ? message : `${path}: ${message}`));
}

/** The sections with the rows that pass the filter and contain the search, in the page's order. */
export function settingSections(
  rows: readonly SettingRow[],
  filter: SettingFilter,
  query: string,
  lang: Lang,
): readonly SettingsSection[] {
  const wanted = fold(query);
  const shown = rows.filter(
    (row) =>
      passes(row, filter) &&
      fold(`${row.name} ${row.description} ${row.setting.key}`).includes(wanted),
  );
  return SETTING_SECTIONS.map((key) => ({
    key,
    name: sectionName(key, lang),
    rows: shown.filter((row) => row.setting.section === key),
  })).filter((section) => section.rows.length > 0);
}

/** Whether `row` passes the filter `filter`. */
export function passes(row: SettingRow, filter: SettingFilter): boolean {
  if (filter === "all") return true;
  if (filter === "modified") return row.default !== undefined;
  return row.setting[filter] === true;
}

/** Whether the issue is at the setting's key or inside it. */
function covers(setting: Setting, issue: ConfigIssue): boolean {
  return setting.clone !== true && `${issue.path}.`.startsWith(`${setting.key}.`);
}

function issuesAt(setting: Setting, issues: readonly ConfigIssue[]): readonly string[] {
  return issues
    .filter((issue) => covers(setting, issue))
    .map(({ path, message }) =>
      path === setting.key ? message : `${path.slice(setting.key.length + 1)}: ${message}`,
    );
}

/** The value at the key `key`, with dots, of a configuration as JSON gives it. */
function at(source: unknown, key: string): unknown {
  let value = source;
  for (const part of key.split(".")) value = isObject(value) ? value[part] : undefined;
  return value;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A value in words: a list's or a map's elements, a group's keys, or the value itself. */
function words(value: unknown, setting: Setting, t: Translate, lang: Lang): ValueWords {
  const items = Array.isArray(value)
    ? value.map((item) => brief(item, t))
    : isObject(value)
      ? Object.entries(value).map(([key, item]) => `${key}: ${brief(item, t)}`)
      : [single(value, setting, t, lang)];
  if (items.length === 0) return { items: [t("Sin elementos", "None")], more: 0 };
  return { items: items.slice(0, SHOWN), more: Math.max(0, items.length - SHOWN) };
}

/** A single value: an option by its name, yes or no, a number with its unit, or the text. */
function single(value: unknown, setting: Setting, t: Translate, lang: Lang): string {
  if (value === undefined || value === null) return t("Sin valor", "Not set");
  if (typeof value === "boolean") return value ? t("Sí", "Yes") : t("No", "No");
  if (typeof value === "number" && setting.unit !== undefined) return `${value} ${setting.unit}`;
  if (typeof value === "string" && setting.options?.includes(value) === true)
    return optionName(setting.key, value, lang);
  return String(value);
}

/** An element of a list or a map: a short list joined, a long one counted, an object by its keys. */
function brief(value: unknown, t: Translate): string {
  if (Array.isArray(value)) {
    const plain = value.every((item) => typeof item !== "object" || item === null);
    return plain && value.length <= 3
      ? value.map(String).join(", ")
      : t(`${value.length} elementos`, `${value.length} items`);
  }
  if (isObject(value))
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${brief(item, t)}`)
      .join(" · ");
  return String(value);
}
