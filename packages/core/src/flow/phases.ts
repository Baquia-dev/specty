// SPDX-License-Identifier: Apache-2.0

export type Phase =
  | "draft"
  | "review"
  | "implementing"
  | "acceptance"
  | "adjusting"
  | "closing"
  | "done"
  | "cancelled";

export const PHASES: readonly Phase[] = [
  "draft",
  "review",
  "implementing",
  "acceptance",
  "adjusting",
  "closing",
  "done",
  "cancelled",
];

/** Governed code: blocked, or open only for the active task's scope. */
export type CodeAccess = "blocked" | "active-task";

/**
 * Edits to `spec.md`: free (draft, review), append-only (adjusting: new tasks and criteria,
 * done tasks immutable), closing-only (the Closing section) or locked.
 */
export type SpecAccess = "free" | "append-only" | "closing-only" | "locked";

export type WaitingFor = "agent" | "human" | "nobody";

export interface PhasePermissions {
  readonly code: CodeAccess;
  readonly spec: SpecAccess;
  readonly waitingFor: WaitingFor;
}

const PERMISSIONS: Readonly<Record<Exclude<Phase, "closing">, PhasePermissions>> = {
  draft: { code: "blocked", spec: "free", waitingFor: "agent" },
  review: { code: "blocked", spec: "free", waitingFor: "human" },
  implementing: { code: "active-task", spec: "locked", waitingFor: "agent" },
  acceptance: { code: "blocked", spec: "locked", waitingFor: "human" },
  adjusting: { code: "blocked", spec: "append-only", waitingFor: "agent" },
  done: { code: "blocked", spec: "locked", waitingFor: "nobody" },
  cancelled: { code: "blocked", spec: "locked", waitingFor: "nobody" },
};

/** What each phase allows (ARCHITECTURE §4). */
export function phasePermissions(phase: Phase, closingSubmitted = false): PhasePermissions {
  if (phase === "closing") {
    return {
      code: "blocked",
      spec: "closing-only",
      waitingFor: closingSubmitted ? "human" : "agent",
    };
  }
  return PERMISSIONS[phase];
}
