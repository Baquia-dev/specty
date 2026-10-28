// SPDX-License-Identifier: Apache-2.0
// The sample change in the testing phase, "Avisos de nuevas calificaciones": with
// `policy.tests: contract` its agent wrote the tests before the code and sent them red; and
// approving them, the way the CLI does (ADR 0014).
import type { AuditRecord } from "./progress";
import { ActionError, type ChangeRecord } from "./records";

const MINUTE = 60_000;

const SPEC = `---
kind: standard
---

# Avisos de nuevas calificaciones

## Objetivo

La familia recibe un aviso cuando el docente publica una calificación, y lo abre para ver la nota.

## Fuera de alcance

- Avisos por correo: solo dentro de la app.

## Supuestos

- A1: Una calificación publicada ya no cambia sin que el docente la vuelva a publicar.

## Criterios de aceptación

- AC1: CUANDO el docente publica una calificación ENTONCES la familia del estudiante recibe un aviso.
- AC2: CUANDO la familia abre el aviso ENTONCES ve la nota y la materia.

## Archivos

- crear lib/grades/grade_notice.dart — el aviso y su vista
- crear test/grades/grade_notice_test.dart — el aviso al publicar
- crear test/grades/notice_view_test.dart — la nota y la materia del aviso

## Tareas

- [ ] T1: El aviso al publicar una calificación
  - files: lib/grades/grade_notice.dart, test/grades/grade_notice_test.dart
  - ac: AC1
- [ ] T2: La vista del aviso
  - files: lib/grades/grade_notice.dart, test/grades/notice_view_test.dart
  - ac: AC2
`;

const event = (ts: string, actor: AuditRecord["actor"], name: string, data: object) => ({
  ts,
  actor,
  event: name,
  data: { ...data },
});

/** Approved nine minutes ago; its tests went out, red, two minutes ago. */
export function noticesSample(record: ChangeRecord, now: number): ChangeRecord {
  const at = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  return {
    ...record,
    spec: SPEC,
    state: { ...record.state, testsSubmittedAt: at(2) },
    audit: [
      event(at(40), "agent", "change.created", { kind: "standard", branch: record.state.branch }),
      event(at(25), "agent", "spec.proposed", { revision: 1, size: "M" }),
      event(at(9), "human", "spec.approved", { revision: 1, channel: "tty" }),
      event(at(2), "agent", "tests.proposed", {
        count: 2,
        files: ["test/grades/grade_notice_test.dart", "test/grades/notice_view_test.dart"],
        red: [{ cmd: "flutter test test/grades", exit: 1 }],
      }),
    ],
  };
}

/**
 * The person approves the tests the agent sent, as the server does: the change goes on to the
 * implementation with each of them locked by its hash (`hash`, the sample's).
 */
export function approveTestsIn(record: ChangeRecord, now: number, hash: string): ChangeRecord {
  const { testsSubmittedAt, testCycle: _cycle, ...state } = record.state;
  if (state.phase !== "testing" || testsSubmittedAt === undefined) {
    throw new ActionError({
      es: "Este cambio no tiene tests enviados que aprobar.",
      en: "This change has no tests sent to approve.",
    });
  }
  const audit = record.audit ?? [];
  const sent = audit.findLast((entry) => entry.event === "tests.proposed")?.data.files;
  const files = Array.isArray(sent) ? sent.filter((path) => typeof path === "string") : [];
  const at = new Date(now).toISOString();
  return {
    ...record,
    phaseSince: at,
    state: {
      ...state,
      phase: "implementing",
      lockedTests: {
        ...state.lockedTests,
        ...Object.fromEntries(files.map((path) => [path, hash])),
      },
    },
    audit: [...audit, event(at, "human", "tests.approved", { channel: "ui" })],
  };
}
