// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import { type ConfigEdit, settingOf } from "./catalog";

// The view Flujo of the page «Configuración» of `specty ui`: the phases of a change in line, each
// with the pieces the configuration equips, Specty's guarantees among them. Pure, for the UI's main
// thread; their names and descriptions are in `cards/settings-pieces.ts`.

/** The phases of the line, in order; `testing` only shows with `policy.tests: contract`. */
export const FLOW_PHASES = [
  "draft",
  "review",
  "testing",
  "implementing",
  "acceptance",
  "closing",
] as const satisfies readonly Phase[];

export type FlowPhase = (typeof FLOW_PHASES)[number];

/** The value of a setting by its key with dots, such as the file's with the edits or the default. */
export type SettingValue = (key: string) => unknown;

/** A piece of yes or no: equipped while `key` holds `on`; removing it gives it `off`. */
interface PieceToggle {
  readonly key: string;
  readonly on: string | boolean;
  readonly off: string | boolean;
}

export interface Piece {
  readonly id: string;
  readonly phase: FlowPhase;
  /** The settings of the catalog it is adjusted with, in order. */
  readonly keys: readonly string[];
  readonly toggle?: PieceToggle;
  /** A piece of a command: equipped while this key has a value; removing it takes its keys out. */
  readonly command?: string;
  /** A guarantee of Specty: always equipped, with no key nor control. */
  readonly guarantee?: true;
  /** It has no key yet: always equipped, with no control. */
  readonly soon?: true;
  /** It lives in the clone (delegated mode): its own control changes it, not an edit of the file. */
  readonly clone?: true;
}

const yesOrNo = (key: string): PieceToggle => ({ key, on: true, off: false });

/** Each piece, in the line's order: by phase, then as the phase reads. */
export const PIECES: readonly Piece[] = [
  { id: "glossary", phase: "draft", keys: ["glossary"] },
  {
    id: "spec-warnings",
    phase: "draft",
    keys: ["warnings.vagueTerms", "warnings.horizontalLayers"],
  },
  {
    id: "worktrees",
    phase: "draft",
    keys: ["git.worktrees", "git.setup"],
    toggle: yesOrNo("git.worktrees"),
  },
  { id: "spec-approval", phase: "review", keys: [], guarantee: true },
  {
    id: "independent-review",
    phase: "review",
    keys: ["review.command", "review.timeoutSec"],
    command: "review.command",
  },
  {
    id: "delegated",
    phase: "review",
    keys: ["specty delegate"],
    toggle: yesOrNo("specty delegate"),
    clone: true,
  },
  { id: "tests-approval", phase: "testing", keys: [], guarantee: true },
  { id: "tests", phase: "implementing", keys: ["policy.tests", "scope.implicitTests"] },
  { id: "task-verify", phase: "implementing", keys: ["verify.default", "verify.timeoutSec"] },
  { id: "quick-check", phase: "implementing", keys: ["verify.quick"], command: "verify.quick" },
  {
    id: "checks",
    phase: "implementing",
    keys: [
      "checks.levels",
      "checks.taskDone.skip",
      "checks.maxFindings",
      "checks.exclude",
      "checks.todo",
      "checks.functions",
      "checks.commands",
    ],
  },
  {
    id: "lines",
    phase: "implementing",
    keys: ["lines.warn", "lines.fail", "lines.tests", "lines.exclude"],
  },
  { id: "subagents", phase: "implementing", keys: ["subagents"], toggle: yesOrNo("subagents") },
  {
    id: "auto-approve",
    phase: "implementing",
    keys: ["scope.autoApprove", "scope.generated"],
    toggle: { key: "scope.autoApprove", on: "tests-and-generated", off: "none" },
  },
  {
    id: "pre-commit",
    phase: "implementing",
    keys: ["checks.preCommit"],
    toggle: yesOrNo("checks.preCommit"),
  },
  { id: "guard", phase: "implementing", keys: [], guarantee: true },
  { id: "full-verify", phase: "acceptance", keys: ["verify.full", "verify.units", "verify.slots"] },
  { id: "coverage", phase: "acceptance", keys: ["checks.coverage"] },
  { id: "acceptance", phase: "acceptance", keys: [], guarantee: true },
  { id: "closing", phase: "closing", keys: [], soon: true },
  {
    id: "retro",
    phase: "closing",
    keys: ["retro.mode"],
    toggle: { key: "retro.mode", on: "agent", off: "minimal" },
  },
  {
    id: "after-landing",
    phase: "closing",
    keys: ["git.afterLanding"],
    command: "git.afterLanding",
  },
];

/** The phases the line shows with these values: Tests only with `policy.tests: contract`. */
export function flowPhases(value: SettingValue): readonly FlowPhase[] {
  const contract = value("policy.tests") === "contract";
  return FLOW_PHASES.filter((phase) => phase !== "testing" || contract);
}

/**
 * Whether the piece is equipped with these values: one of yes or no while its key holds the value
 * that equips it, one of a command while it has one; the rest, always.
 */
export function isEquipped(piece: Piece, value: SettingValue): boolean {
  if (piece.toggle !== undefined) return value(piece.toggle.key) === piece.toggle.on;
  if (piece.command !== undefined) {
    const command = value(piece.command);
    return typeof command === "string" && command.trim() !== "";
  }
  return true;
}

/**
 * The edits of `config.yaml` that equip or remove the piece. One of yes or no gives its key the
 * value, or takes it out where that is its default (`fallback`); removing one of a command takes its
 * keys out, and equipping it waits for the person to write the command. The rest have none, nor
 * delegated mode, which lives in the clone.
 */
export function pieceEdits(
  piece: Piece,
  equip: boolean,
  fallback: SettingValue,
): readonly ConfigEdit[] {
  if (piece.clone === true) return [];
  if (piece.toggle !== undefined) {
    const { key, on, off } = piece.toggle;
    const target = equip ? on : off;
    const path = key.split(".");
    return [fallback(key) === target ? { path } : { path, value: target }];
  }
  if (piece.command === undefined || equip) return [];
  return piece.keys
    .map((key) => key.split("."))
    .filter((path) => settingOf(path) !== undefined)
    .map((path) => ({ path }));
}
