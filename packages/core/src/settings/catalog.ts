// SPDX-License-Identifier: Apache-2.0
import { GIT_FLOWS } from "../branches";
import { LANGS } from "../i18n";

// The settings the page «Configuración» of `specty ui` shows: each key of `.specty/config.yaml`
// (formats.md §6), delegated mode, which lives in the clone, and Specty's guarantees, fixed with no
// key. Pure, for the UI's main thread; their names and descriptions are in `cards/settings.ts`.

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
  "warnings",
  "team",
  "memory",
  "usage",
  "dev",
  "ui",
  "effort",
  "glossary",
  "internal",
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
  /** The unit of a number: milliseconds, seconds, minutes, hours or days. */
  readonly unit?: "ms" | "s" | "min" | "h" | "d";
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
  /** A guarantee of Specty: fixed, with no key; its id is not a key of `config.yaml`. */
  readonly guarantee?: true;
  /** A guarantee's fixed value, in its `unit`. */
  readonly fixed?: number;
}

/**
 * Section «Interno», execution, server and hooks: the priority of the verifications, the most
 * Specty reads of a command's output, the ports `specty ui` tries, the time of Antigravity's hooks
 * and the limits of the UI's server, which Specty kept fixed in its code, as keys of `internal`
 * (formats.md §6).
 */
const INTERNAL_RUN: readonly Setting[] = [
  { key: "internal.exec.priority", section: "internal", kind: "number", new: true },
  { key: "internal.exec.maxOutputKiB", section: "internal", kind: "number", new: true },
  { key: "internal.server.portsTried", section: "internal", kind: "number", new: true },
  {
    key: "internal.hooks.antigravityTimeoutSec",
    section: "internal",
    kind: "number",
    unit: "s",
    new: true,
  },
  ...["changesEveryMs", "tasksEveryMs"].map(
    (key): Setting => ({
      key: `internal.server.${key}`,
      section: "internal",
      kind: "number",
      unit: "ms",
      new: true,
    }),
  ),
  { key: "internal.server.runLines", section: "internal", kind: "number", new: true },
  {
    key: "internal.server.runEveryMs",
    section: "internal",
    kind: "number",
    unit: "ms",
    new: true,
  },
  { key: "internal.server.maxBodyKiB", section: "internal", kind: "number", new: true },
];

/**
 * Section «Interno»: the parameters Specty kept fixed in its code, as keys of `internal`, and the
 * lives of compliance, fixed with no key: four at 24 h and the mark of `specty wait` at 30 s
 * (formats.md §6).
 */
const INTERNAL: readonly Setting[] = [
  {
    key: "internal.waits.waitTimeoutSec",
    section: "internal",
    kind: "number",
    unit: "s",
    new: true,
  },
  { key: "internal.waits.heartbeatSec", section: "internal", kind: "number", unit: "s", new: true },
  {
    key: "internal.waits.verifyIntervalMs",
    section: "internal",
    kind: "number",
    unit: "ms",
    new: true,
  },
  {
    key: "internal.waits.waitIntervalMs",
    section: "internal",
    kind: "number",
    unit: "ms",
    new: true,
  },
  {
    key: "internal.waits.queueStaleSec",
    section: "internal",
    kind: "number",
    unit: "s",
    new: true,
  },
  { key: "internal.retries.landing", section: "internal", kind: "number", new: true },
  { key: "internal.retries.memory", section: "internal", kind: "number", new: true },
  { key: "internal.retries.gitConfig", section: "internal", kind: "number", new: true },
  {
    key: "internal.retention.verifiedDays",
    section: "internal",
    kind: "number",
    unit: "d",
    new: true,
  },
  {
    key: "internal.retention.indexHours",
    section: "internal",
    kind: "number",
    unit: "h",
    new: true,
  },
  ...INTERNAL_RUN,
  ...["receipts", "guardPending", "shellSnapshots", "sessions"].map(
    (life): Setting => ({
      key: `guarantee.${life}`,
      section: "internal",
      kind: "number",
      unit: "h",
      fixed: 24,
      guarantee: true,
    }),
  ),
  {
    key: "guarantee.waitMarks",
    section: "internal",
    kind: "number",
    unit: "s",
    fixed: 30,
    guarantee: true,
  },
];

/**
 * Sections «Avisos» and «Consumo y sesiones»: the warnings of the spec and of the sessions, which
 * Specty kept fixed in its code, as keys of `warnings` and `usage` (formats.md §6).
 */
const WARNINGS: readonly Setting[] = [
  { key: "warnings.vagueTerms", section: "warnings", kind: "list", new: true },
  { key: "warnings.horizontalLayers", section: "warnings", kind: "list", new: true },
];
const USAGE: readonly Setting[] = [
  { key: "usage.freshSessionTokens", section: "usage", kind: "number", new: true },
  { key: "usage.ccusage.timeoutSec", section: "usage", kind: "number", unit: "s", new: true },
  { key: "usage.ccusage.version", section: "usage", kind: "text", new: true },
];

const TESTS_POLICIES = ["contract", "required", "recommended", "off"];

/**
 * Section «Tamaño y cortes», after the splitting limits: how the size is scored and from when a
 * change is close to splitting. The CLI does not measure fan-in yet (formats.md §6).
 */
const SIZING: readonly Setting[] = [
  { key: "sizing.weights", section: "size", kind: "group", new: true },
  { key: "sizing.tasksWithoutWeight", section: "size", kind: "number", new: true },
  { key: "sizing.highFanIn", section: "size", kind: "number", soon: true, new: true },
  { key: "sizing.nearRatio", section: "size", kind: "number", new: true },
];

/** Section «Esfuerzo recomendado»: the effort of each size, and the rule for a task's. */
const EFFORT: readonly Setting[] = ["S", "M", "L", "XL", "task"].map(
  (part): Setting => ({ key: `effort.${part}`, section: "effort", kind: "group", new: true }),
);

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
  ...SIZING,
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
  ...WARNINGS,
  { key: "team.approvers", section: "team", kind: "list", soon: true },
  { key: "team.requirePrReview", section: "team", kind: "toggle", soon: true },
  { key: "memory.orphanAfterMin", section: "memory", kind: "number", unit: "min" },
  { key: "memory.branch", section: "memory", kind: "text" },
  ...USAGE,
  { key: "dev.ports", section: "dev", kind: "list", items: "number" },
  { key: "ui.port", section: "ui", kind: "number" },
  { key: "ui.requireUserPresence", section: "ui", kind: "toggle", soon: true },
  ...EFFORT,
  { key: "glossary", section: "glossary", kind: "text" },
  ...INTERNAL,
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
 * only the file changes, nor Specty's guarantees, which have no key.
 */
export function settingOf(path: readonly string[]): Setting | undefined {
  const setting = SETTINGS.find((candidate) => {
    const parts = candidate.key.split(".");
    return parts.length <= path.length && parts.every((part, index) => path[index] === part);
  });
  const marks = [setting?.clone, setting?.soon, setting?.fileOnly, setting?.guarantee];
  return marks.includes(true) ? undefined : setting;
}

/**
 * The settings whose value differs between two readings of `config.yaml`, in the page's order:
 * its value in each, as JSON compares them, with none where the key is not there.
 */
export function settingChanges(before: unknown, after: unknown): readonly SettingChange[] {
  return SETTINGS.flatMap((setting) => {
    if (setting.clone === true || setting.guarantee === true) return [];
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
