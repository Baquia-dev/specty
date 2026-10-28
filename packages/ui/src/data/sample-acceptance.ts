// SPDX-License-Identifier: Apache-2.0
// The sample change waiting for acceptance, "Panel de asistencia por curso", with the work that
// backs each criterion; and accepting it or asking for adjustments, the way the CLI does.
import type { ResultDecision } from "./acceptance";
import type { AuditRecord } from "./progress";
import { ActionError, type ChangeRecord, type CriterionTests } from "./records";
import { withProgress } from "./sample-progress";

const MINUTE = 60_000;

const event = (
  ts: string,
  actor: AuditRecord["actor"],
  name: string,
  data: object,
): AuditRecord => ({ ts, actor, event: name, data: { ...data } });

/** The tests that carry each criterion's id, as the local server reads them from the commits. */
const CRITERIA_TESTS: readonly CriterionTests[] = [
  {
    id: "AC1",
    manual: false,
    owed: true,
    tests: [
      {
        path: "test/attendance/attendance_repository_test.dart",
        line: 14,
        task: "T1",
        commit: "3c9d1e2",
      },
      { path: "test/attendance/course_panel_test.dart", line: 9, task: "T2", commit: "8b0a4f6" },
    ],
  },
  {
    id: "AC2",
    manual: false,
    owed: true,
    tests: [
      { path: "test/attendance/course_panel_test.dart", line: 41, task: "T2", commit: "8b0a4f6" },
    ],
  },
];

/** Both tasks done and verified; the panel passed at its second try. */
export function asistenciaSample(record: ChangeRecord, now: number): ChangeRecord {
  const at = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  const cmd = "flutter test test/attendance";
  return withProgress(
    { ...record, criteriaTests: CRITERIA_TESTS },
    {
      tasks: {
        T1: {
          status: "done",
          baseCommit: "5d2a7b0",
          commit: "3c9d1e2",
          attempts: 1,
          startedAt: at(150),
          doneAt: at(132),
          summary: "Porcentaje semanal de asistencia por curso, calculado en el repositorio.",
          scopeExtra: [],
        },
        T2: {
          status: "done",
          baseCommit: "3c9d1e2",
          commit: "8b0a4f6",
          attempts: 2,
          startedAt: at(131),
          doneAt: at(96),
          summary: "Panel por curso con los estudiantes de más de tres ausencias resaltados.",
          scopeExtra: [],
        },
      },
      pending: { scopeRequests: [], adjustment: null },
      audit: [
        event(at(150), "agent", "task.started", { task: "T1", baseCommit: "5d2a7b0" }),
        event(at(133), "specty", "task.verified", { task: "T1", cmd, exit: 0, ms: 12_000 }),
        event(at(132), "agent", "task.completed", {
          task: "T1",
          commit: "3c9d1e2",
          risks: [
            {
              path: "lib/attendance/attendance_repository.dart",
              rule: "secret",
              cwe: "CWE-798",
              line: 12,
            },
          ],
        }),
        event(at(131), "agent", "task.started", { task: "T2", baseCommit: "3c9d1e2" }),
        event(at(112), "specty", "task.verified", {
          task: "T2",
          cmd,
          exit: 1,
          ms: 19_000,
          outputTail: [
            "00:19 +8 -1: highlights students over three absences [E]",
            "  Expected: <true>",
            "    Actual: <false>",
            "  test/attendance/course_panel_test.dart:41:5",
            "00:19 +8 -1: Some tests failed.",
          ],
        }),
        event(at(97), "specty", "task.verified", { task: "T2", cmd, exit: 0, ms: 21_000 }),
        event(at(96), "agent", "task.completed", {
          task: "T2",
          commit: "8b0a4f6",
          removedAssertions: [{ path: "test/attendance/course_panel_test.dart", removed: 1 }],
        }),
      ],
    },
  );
}

/**
 * What the person's decision on the result does to a record, as the CLI does it: accepting moves
 * on to the closing (a quick change closes), and adjusting keeps the literal request for the agent.
 */
export function decideResultIn(
  record: ChangeRecord,
  decision: ResultDecision,
  now: number,
): ChangeRecord {
  const { state } = record;
  if (state.phase !== "acceptance") {
    throw new ActionError({
      es: "Este cambio ya no espera que aceptes el resultado.",
      en: "This change no longer waits for you to accept the result.",
    });
  }
  const at = new Date(now).toISOString();
  const audit = record.audit ?? [];
  if (decision.kind === "adjust") {
    const request = decision.request.trim();
    if (request === "") {
      throw new ActionError({ es: "Escribe qué hay que ajustar.", en: "Write what to adjust." });
    }
    return {
      ...record,
      phaseSince: at,
      state: {
        ...state,
        phase: "adjusting",
        pending: { ...state.pending, adjustment: { request, at } },
      },
      audit: [...audit, event(at, "human", "adjust.requested", { request })],
    };
  }
  const quick = state.kind === "quick";
  return {
    ...record,
    phaseSince: at,
    state: { ...state, phase: quick ? "done" : "closing" },
    audit: [
      ...audit,
      quick
        ? event(at, "human", "change.closed", { lane: "quick" })
        : event(at, "human", "change.accepted", { revision: state.revision }),
    ],
  };
}
