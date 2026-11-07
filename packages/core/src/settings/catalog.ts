// SPDX-License-Identifier: Apache-2.0
import { GIT_FLOWS } from "../branches";
import { LANGS } from "../i18n";

// The settings the page «Configuración» of `specty ui` shows: each key of `.specty/config.yaml`
// (formats.md §6) and delegated mode, which lives in the clone. Pure, for the UI's main thread;
// their names and descriptions are in `cards/settings.ts`.

/** The sections of the page, in its order. */
export const SETTING_SECTIONS = [
  "flow",
  "verify",
  "git",
  "review",
  "scope",
  "size",
  "lines",
  "checks",
  "team",
  "memory",
  "dev",
  "ui",
  "effort",
  "glossary",
] as const;

export type SettingSection = (typeof SETTING_SECTIONS)[number];

/**
 * How a setting's value is shown and, once the page saves, edited: one of its `options`, on or
 * off, a number, a text, a command of the project, a list, a map by name, or a group of keys.
 */
type SettingKind = "choice" | "toggle" | "number" | "text" | "command" | "list" | "map" | "group";

export interface Setting {
  /** Its key in `config.yaml`, with dots; a group's, the key that holds its keys. */
  readonly key: string;
  readonly section: SettingSection;
  readonly kind: SettingKind;
  /** The values of a choice, in order. */
  readonly options?: readonly string[];
  /** The unit of a number: seconds or minutes. */
  readonly unit?: "s" | "min";
  /** It changes what the agent may do without the person. */
  readonly permissions?: true;
  /** It runs a command of the project. */
  readonly command?: true;
  /** It lives in the clone (`.git/common/specty/`), not in `config.yaml`. */
  readonly clone?: true;
  /** Nothing in Specty uses it yet. */
  readonly soon?: true;
  /** A parameter Specty kept fixed in its code until it became a setting. */
  readonly new?: true;
  /** It changes only in `config.yaml`: its elements are objects, which the UI does not edit. */
  readonly fileOnly?: true;
  /** What a list holds when it is not texts: numbers. */
  readonly items?: "number";
}

const TESTS_POLICIES = ["contract", "required", "recommended", "off"];

/** Each setting, in the page's order: by section, then as the section reads. */
export const SETTINGS: readonly Setting[] = [
  { key: "language", section: "flow", kind: "choice", options: LANGS },
  { key: "mode", section: "flow", kind: "choice", options: ["individual", "team"] },
  {
    key: "policy.tests",
    section: "flow",
    kind: "choice",
    options: TESTS_POLICIES,
    permissions: true,
  },
  { key: "subagents", section: "flow", kind: "toggle" },
  { key: "retro.mode", section: "flow", kind: "choice", options: ["agent", "minimal"] },
  { key: "specty delegate", section: "flow", kind: "toggle", clone: true, permissions: true },
  { key: "verify.default", section: "verify", kind: "command", command: true },
  { key: "verify.full", section: "verify", kind: "command", command: true },
  { key: "verify.quick", section: "verify", kind: "command", command: true },
  { key: "verify.timeoutSec", section: "verify", kind: "number", unit: "s" },
  { key: "verify.slots", section: "verify", kind: "number" },
  { key: "verify.units", section: "verify", kind: "list", command: true, fileOnly: true },
  { key: "git.branchPerChange", section: "git", kind: "toggle" },
  { key: "git.worktrees", section: "git", kind: "toggle" },
  { key: "git.flow", section: "git", kind: "choice", options: GIT_FLOWS },
  { key: "git.branchPattern", section: "git", kind: "text" },
  { key: "git.target", section: "git", kind: "text" },
  { key: "git.setup", section: "git", kind: "command", command: true },
  { key: "git.afterLanding", section: "git", kind: "command", command: true },
  { key: "review.command", section: "review", kind: "command", command: true },
  { key: "review.timeoutSec", section: "review", kind: "number", unit: "s" },
  { key: "governed", section: "scope", kind: "list", permissions: true },
  { key: "ignored", section: "scope", kind: "list", permissions: true },
  { key: "sensitive", section: "scope", kind: "list", permissions: true },
  { key: "scope.implicitTests", section: "scope", kind: "toggle", permissions: true },
  { key: "scope.generated", section: "scope", kind: "list", permissions: true },
  {
    key: "scope.autoApprove",
    section: "scope",
    kind: "choice",
    options: ["none", "tests-and-generated"],
    permissions: true,
  },
  { key: "size", section: "size", kind: "group" },
  { key: "lanes.quick.maxFiles", section: "size", kind: "number" },
  { key: "split", section: "size", kind: "group" },
  { key: "lines.warn", section: "lines", kind: "number" },
  { key: "lines.fail", section: "lines", kind: "number" },
  { key: "lines.tests", section: "lines", kind: "group" },
  { key: "lines.exclude", section: "lines", kind: "list" },
  { key: "checks.levels", section: "checks", kind: "map", permissions: true },
  { key: "checks.maxFindings", section: "checks", kind: "number" },
  { key: "checks.exclude", section: "checks", kind: "list" },
  { key: "checks.todo", section: "checks", kind: "group" },
  { key: "checks.functions", section: "checks", kind: "group" },
  { key: "checks.layers", section: "checks", kind: "map", fileOnly: true },
  { key: "checks.generators", section: "checks", kind: "list", command: true, fileOnly: true },
  { key: "checks.preCommit", section: "checks", kind: "toggle" },
  { key: "checks.commands", section: "checks", kind: "group", command: true },
  { key: "checks.coverage", section: "checks", kind: "group" },
  { key: "checks.testTime", section: "checks", kind: "group", fileOnly: true },
  { key: "team.approvers", section: "team", kind: "list", soon: true },
  { key: "team.requirePrReview", section: "team", kind: "toggle", soon: true },
  { key: "memory.orphanAfterMin", section: "memory", kind: "number", unit: "min" },
  { key: "memory.branch", section: "memory", kind: "text" },
  { key: "dev.ports", section: "dev", kind: "list", items: "number" },
  { key: "ui.port", section: "ui", kind: "number", soon: true },
  { key: "ui.requireUserPresence", section: "ui", kind: "toggle", soon: true },
  { key: "effort", section: "effort", kind: "map", soon: true },
  { key: "glossary", section: "glossary", kind: "text" },
];

/** An edit of `config.yaml` from the UI: the keys to a value and the new value, or none to reset it. */
export interface ConfigEdit {
  readonly path: readonly string[];
  readonly value?: unknown;
}

/** A setting whose value in the file changes: before and after, none where the key is not there. */
export interface SettingChange {
  readonly key: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

/**
 * The setting an edit's `path` falls in: the one whose key it is or is inside of, among those the
 * UI saves. Not delegated mode, which lives in the clone, nor those with no effect yet, nor those
 * only the file changes.
 */
export function settingOf(path: readonly string[]): Setting | undefined {
  const setting = SETTINGS.find((candidate) => {
    const parts = candidate.key.split(".");
    return parts.length <= path.length && parts.every((part, index) => path[index] === part);
  });
  const saved = setting?.clone !== true && setting?.soon !== true && setting?.fileOnly !== true;
  return saved ? setting : undefined;
}

/**
 * The settings whose value differs between two readings of `config.yaml`, in the page's order:
 * its value in each, as JSON compares them, with none where the key is not there.
 */
export function settingChanges(before: unknown, after: unknown): readonly SettingChange[] {
  return SETTINGS.flatMap((setting) => {
    if (setting.clone === true) return [];
    const old = valueAt(before, setting.key);
    const now = valueAt(after, setting.key);
    if (JSON.stringify(old) === JSON.stringify(now)) return [];
    return [
      {
        key: setting.key,
        ...(old === undefined ? {} : { before: old }),
        ...(now === undefined ? {} : { after: now }),
      },
    ];
  });
}

/** The value at a key with dots, inside maps; none when a key on the way is missing. */
function valueAt(value: unknown, key: string): unknown {
  let current = value;
  for (const part of key.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = Object.entries(current).find(([name]) => name === part)?.[1];
  }
  return current;
}
