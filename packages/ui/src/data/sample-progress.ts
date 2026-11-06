// SPDX-License-Identifier: Apache-2.0
// Sample work in progress: what Specty keeps of each task (state.json) and the verifications it
// logs (audit.jsonl), so the Progress tab shows times, commits, attempts and a failure's lines;
// and, with `policy.tests: contract`, the tests each change locked and an unlock of each kind.
import type { ChangeState } from "@baquia-dev/specty-core";
import { unlocksOf } from "./locks";
import type { AuditRecord } from "./progress";
import { ActionError, type ChangeRecord } from "./records";
import { GOOGLE_PROVIDER_UNLOCK, REPORT_CARD_UNLOCK } from "./sample-test-code";

const MINUTE = 60_000;
/** The hash each sample test was locked with when the person approved it. */
const LOCKED = `sha256:${"0".repeat(64)}`;

type Progress = Pick<ChangeState, "tasks" | "pending" | "lockedTests"> & {
  readonly audit: readonly AuditRecord[];
};

type ScopeRequest = ChangeState["pending"]["scopeRequests"][number];

const ago = (now: number, minutes: number) => new Date(now - minutes * MINUTE).toISOString();

const event = (
  ts: string,
  actor: AuditRecord["actor"],
  name: string,
  data: object,
): AuditRecord => ({
  ts,
  actor,
  event: name,
  data: { ...data },
});

/** S2 of the boletines: T3 asks to change the approved test of the signature. */
const SIGNATURE_UNLOCK: ScopeRequest = {
  id: "S2",
  task: "T3",
  paths: ["test/reports/report_card_test.dart"],
  reason: "El test espera «Firma del rector», pero el colegio elige en su perfil quién firma.",
  patch: REPORT_CARD_UNLOCK.patch,
  evidence: [...REPORT_CARD_UNLOCK.evidence],
};

/**
 * "Exportar boletines en PDF": two tasks done (one at the second try), the third failing and
 * waiting for two requests: a file outside its scope and the unlock of its approved test.
 */
export function boletinesProgress(now: number): Progress {
  const at = (minutes: number) => ago(now, minutes);
  return {
    tasks: boletinesTasks(at),
    pending: {
      scopeRequests: [
        {
          id: "S1",
          task: "T3",
          paths: ["lib/shared/pdf/layout.dart"],
          reason: "La firma necesita el maquetador compartido.",
        },
        SIGNATURE_UNLOCK,
      ],
      adjustment: null,
    },
    lockedTests: { "test/reports/report_card_test.dart": LOCKED },
    audit: boletinesAudit(at),
  };
}

/** What state.json keeps of the boletines tasks. */
function boletinesTasks(at: (minutes: number) => string): Progress["tasks"] {
  return {
    T1: {
      status: "done",
      baseCommit: "9f1c2e7",
      commit: "a1b2c3d",
      attempts: 1,
      startedAt: at(45),
      doneAt: at(31),
      summary: "Plantilla del boletín con notas, promedios y observaciones.",
      scopeExtra: [],
    },
    T2: {
      status: "done",
      baseCommit: "a1b2c3d",
      commit: "7e4f9a0",
      attempts: 2,
      startedAt: at(30),
      doneAt: at(19),
      summary: "Botón «Descargar PDF» en la ficha del boletín.",
      scopeExtra: [],
    },
    T3: {
      status: "active",
      baseCommit: "7e4f9a0",
      attempts: 1,
      startedAt: at(12),
      scopeExtra: [],
    },
  };
}

/** What audit.jsonl logs of the boletines tasks: their starts, verifications and completions. */
function boletinesAudit(at: (minutes: number) => string): Progress["audit"] {
  const cmd = "flutter test test/reports";
  return [
    event(at(45), "agent", "task.started", { task: "T1", baseCommit: "9f1c2e7" }),
    event(at(32), "specty", "task.verified", { task: "T1", cmd, exit: 0, ms: 18_000 }),
    event(at(31), "agent", "task.completed", { task: "T1", commit: "a1b2c3d" }),
    event(at(30), "agent", "task.started", { task: "T2", baseCommit: "a1b2c3d" }),
    event(at(23), "specty", "task.verified", {
      task: "T2",
      cmd,
      exit: 1,
      ms: 12_000,
      outputTail: [
        "00:12 +6 -1: download button shows its label [E]",
        "  Expected: 'Descargar PDF'",
        "    Actual: 'Descargar'",
      ],
    }),
    event(at(20), "specty", "task.verified", { task: "T2", cmd, exit: 0, ms: 9_000 }),
    event(at(19), "agent", "task.completed", { task: "T2", commit: "7e4f9a0" }),
    event(at(12), "agent", "task.started", { task: "T3", baseCommit: "7e4f9a0" }),
    event(at(4), "specty", "task.verified", {
      task: "T3",
      cmd,
      exit: 1,
      ms: 7_000,
      outputTail: [
        "00:07 +6 -1: report card footer shows the signature [E]",
        "  Error: Couldn't resolve 'package:boletines/shared/pdf/layout.dart'.",
        "  lib/reports/pdf/report_card.dart:12:8",
        "00:07 +6 -1: Some tests failed.",
      ],
    }),
    event(at(3), "agent", "scope.requested", { request: "S1", task: "T3" }),
    event(at(2), "agent", "scope.requested", SIGNATURE_UNLOCK),
  ];
}

/** S1 of the login, which the person approved for T1: the test of signing out changed. */
const SIGN_OUT_UNLOCK: ScopeRequest = {
  id: "S1",
  task: "T1",
  paths: ["test/auth/google_provider_test.dart"],
  reason: "El test espera que signOut() devuelva true, pero AuthProvider lo declara Future<void>.",
  patch: GOOGLE_PROVIDER_UNLOCK.patch,
  evidence: [...GOOGLE_PROVIDER_UNLOCK.evidence],
};

/**
 * "Login con Google": the provider done, after the person unlocked its approved test with S1; the
 * button in progress with no verification yet.
 */
export function loginProgress(now: number): Progress {
  const at = (minutes: number) => ago(now, minutes);
  const cmd = "flutter test test/auth";
  const { id, task, paths } = SIGN_OUT_UNLOCK;
  return {
    tasks: {
      T1: {
        status: "done",
        commit: "3c9e21f",
        attempts: 1,
        startedAt: at(58),
        doneAt: at(40),
        summary: "Proveedor de Google con el flujo OAuth y su cierre de sesión.",
        scopeExtra: [...paths],
      },
      T2: { status: "active", attempts: 0, startedAt: at(25), scopeExtra: [] },
    },
    pending: { scopeRequests: [], adjustment: null },
    lockedTests: { "test/auth/google_provider_test.dart": LOCKED },
    audit: [
      event(at(58), "agent", "task.started", { task: "T1" }),
      event(at(50), "agent", "scope.requested", SIGN_OUT_UNLOCK),
      event(at(48), "human", "scope.decided", {
        id,
        task,
        paths,
        decision: "approved",
        ...unlockDecided(SIGN_OUT_UNLOCK, paths),
      }),
      event(at(41), "specty", "task.verified", { task: "T1", cmd, exit: 0, ms: 22_000 }),
      event(at(40), "agent", "task.completed", { task: "T1", commit: "3c9e21f" }),
      event(at(25), "agent", "task.started", { task: "T2" }),
    ],
  };
}

/** What `scope.decided` keeps of an approved unlock, as `specty` keeps it (ADR 0014). */
function unlockDecided(request: ScopeRequest, unlocks: readonly string[]): object {
  if (unlocks.length === 0) return {};
  const { patch, evidence } = request;
  return {
    unlock: unlocks,
    ...(patch === undefined ? {} : { patch }),
    ...(evidence === undefined ? {} : { evidence }),
  };
}

/** A sample record with the work in progress above. */
export function withProgress(record: ChangeRecord, progress: Progress): ChangeRecord {
  const { audit, ...state } = progress;
  return { ...record, state: { ...record.state, ...state }, audit };
}

/**
 * What deciding a scope request does to a record, as the local server does: the request leaves
 * the pending list, an approval adds its paths to the task's scope, and both are logged. An
 * approved unlock keeps its tests, its task, its patch and its evidence, as `specty` does.
 */
export function decideScopeIn(
  record: ChangeRecord,
  id: string,
  decision: "approved" | "rejected",
  reason: string | undefined,
  now: number,
): ChangeRecord {
  const { state } = record;
  const request = state.pending.scopeRequests.find((entry) => entry.id === id);
  if (request === undefined) {
    throw new ActionError({
      es: `La solicitud ${id} ya no está pendiente.`,
      en: `Request ${id} is no longer pending.`,
    });
  }
  const unlocks = decision === "approved" ? unlocksOf(state, request) : [];
  const task = state.tasks[request.task];
  const tasks =
    decision === "approved" && task !== undefined
      ? {
          ...state.tasks,
          [request.task]: { ...task, scopeExtra: [...task.scopeExtra, ...request.paths] },
        }
      : state.tasks;
  const scopeRequests = state.pending.scopeRequests.filter((entry) => entry.id !== id);
  const decided = event(new Date(now).toISOString(), "human", "scope.decided", {
    id,
    task: request.task,
    paths: request.paths,
    decision,
    ...(reason === undefined ? {} : { reason }),
    ...unlockDecided(request, unlocks),
  });
  return {
    ...record,
    state: { ...state, tasks, pending: { ...state.pending, scopeRequests } },
    audit: [...(record.audit ?? []), decided],
  };
}
