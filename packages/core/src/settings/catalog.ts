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
  "team",
  "memory",
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
  /** The unit of a number: seconds, minutes or hours. */
  readonly unit?: "s" | "min" | "h";
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
  /** A guarantee of Specty: fixed, with no key; its id is not a key of `config.yaml`. */
  readonly guarantee?: true;
  /** A guarantee's fixed value, in its `unit`. */
  readonly fixed?: number;
}

/**
 * Section «Interno», execution and server: the priority of the verifications and the ports
 * `specty ui` tries, which Specty kept fixed in its code, as keys of `internal` (formats.md §6).
 */
const INTERNAL_RUN: readonly Setting[] = [
  { key: "internal.exec.priority", section: "internal", kind: "number", new: true },
  { key: "internal.server.portsTried", section: "internal", kind: "number", new: true },
];

/**
 * Section «Interno»: the parameters Specty kept fixed in its code, as keys of `internal`, and the
 * four lives of compliance, which stay fixed at 24 h with no key (formats.md §6).
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
  { key: "internal.retries.landing", section: "internal", kind: "number", new: true },
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
];

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
  { key: "verify.units", section: "verify", kind: "list", command: true },
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
  { key: "checks.layers", section: "checks", kind: "map" },
  { key: "checks.generators", section: "checks", kind: "list", command: true },
  { key: "checks.preCommit", section: "checks", kind: "toggle" },
  { key: "checks.commands", section: "checks", kind: "group", command: true },
  { key: "checks.coverage", section: "checks", kind: "group" },
  { key: "checks.testTime", section: "checks", kind: "group" },
  { key: "team.approvers", section: "team", kind: "list", soon: true },
  { key: "team.requirePrReview", section: "team", kind: "toggle", soon: true },
  { key: "memory.orphanAfterMin", section: "memory", kind: "number", unit: "min" },
  { key: "memory.branch", section: "memory", kind: "text" },
  { key: "dev.ports", section: "dev", kind: "list" },
  { key: "ui.port", section: "ui", kind: "number" },
  { key: "ui.requireUserPresence", section: "ui", kind: "toggle", soon: true },
  { key: "effort", section: "effort", kind: "map", soon: true },
  { key: "glossary", section: "glossary", kind: "text" },
  ...INTERNAL,
];
