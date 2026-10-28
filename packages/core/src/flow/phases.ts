// SPDX-License-Identifier: Apache-2.0

export type Phase =
  | "draft"
  | "review"
  | "testing"
  | "implementing"
  | "acceptance"
  | "adjusting"
  | "closing"
  | "done"
  | "cancelled";

export const PHASES: readonly Phase[] = [
  "draft",
  "review",
  "testing",
  "implementing",
  "acceptance",
  "adjusting",
  "closing",
  "done",
  "cancelled",
];

/**
 * Governed code: blocked, open only for the active task's scope, only for the tests of the
 * change's files, or only for the files a pending incorporation of the main branch brings together.
 */
export type CodeAccess = "blocked" | "active-task" | "tests" | "integration";

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
  // ADR 0014: the tests of the criteria, before the code.
  testing: { code: "tests", spec: "locked", waitingFor: "agent" },
  implementing: { code: "active-task", spec: "locked", waitingFor: "agent" },
  acceptance: { code: "blocked", spec: "locked", waitingFor: "human" },
  adjusting: { code: "blocked", spec: "append-only", waitingFor: "agent" },
  done: { code: "blocked", spec: "locked", waitingFor: "nobody" },
  cancelled: { code: "blocked", spec: "locked", waitingFor: "nobody" },
};

/**
 * What each phase allows (ARCHITECTURE §4). Once the agent sent the closing or the tests
 * (`submitted`), the phase waits for the person. A pending incorporation (`integrating`) keeps
 * the phase and its spec access, opens the files it brings together and waits for the agent.
 */
export function phasePermissions(
  phase: Phase,
  submitted = false,
  integrating = false,
): PhasePermissions {
  const waitingFor = submitted ? "human" : "agent";
  const permissions: PhasePermissions =
    phase === "closing"
      ? { code: "blocked", spec: "closing-only", waitingFor }
      : phase === "testing"
        ? { ...PERMISSIONS.testing, waitingFor }
        : PERMISSIONS[phase];
  return integrating ? { ...permissions, code: "integration", waitingFor: "agent" } : permissions;
}
