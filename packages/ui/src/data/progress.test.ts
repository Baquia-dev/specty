// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import { type AuditRecord, formatDuration, progressOf, taskElapsed, workTime } from "./progress";

const SPEC = parseSpec(`---
kind: standard
---

# Exportar boletines en PDF

## Objetivo

El docente descarga el boletín en PDF.

## Fuera de alcance

- Ninguno

## Criterios de aceptación

- AC1: CUANDO el docente pulsa "Descargar PDF" ENTONCES obtiene un PDF con notas y observaciones.

## Archivos

- crear lib/reports/pdf/report_card.dart — composición
- modificar lib/reports/report_screen.dart — botón

## Tareas

- [x] T1: Composición del PDF
  - files: lib/reports/pdf/report_card.dart
  - ac: AC1
- [ ] T2: Botón de descarga
  - files: lib/reports/report_screen.dart
  - ac: AC1
- [ ] T3: Pie de página con firma
  - files: lib/reports/pdf/report_card.dart
  - ac: —
`).spec;

const STATE: ChangeState = {
  schema: 1,
  id: "20261019-boletines-pdf",
  kind: "standard",
  phase: "implementing",
  revision: 1,
  items: {},
  tasks: {
    T1: {
      status: "done",
      commit: "a1b2c3d",
      attempts: 1,
      startedAt: "2026-10-22T10:05:00.000Z",
      doneAt: "2026-10-22T10:19:00.000Z",
      summary: "Plantilla del boletín con notas, promedios y observaciones.",
      scopeExtra: [],
    },
    T2: { status: "active", attempts: 2, startedAt: "2026-10-22T10:20:00.000Z", scopeExtra: [] },
  },
  pending: {
    scopeRequests: [
      { id: "S1", task: "T2", paths: ["lib/shared/pdf/layout.dart"], reason: "La firma." },
    ],
    adjustment: null,
  },
  maxIds: {},
};

const verified = (ts: string, data: Record<string, unknown>): AuditRecord => ({
  ts,
  actor: "specty",
  event: "task.verified",
  data,
});

const AUDIT: readonly AuditRecord[] = [
  { ts: "2026-10-22T10:05:00.000Z", actor: "agent", event: "task.started", data: { task: "T1" } },
  verified("2026-10-22T10:18:00.000Z", { task: "T1", cmd: "flutter test", exit: 0, ms: 18_000 }),
  verified("2026-10-22T10:27:00.000Z", {
    task: "T2",
    cmd: "flutter test",
    exit: 1,
    ms: 12_000,
    outputTail: ["Expected: 'Descargar PDF'", 42, "Actual: 'Descargar'"],
  }),
  // Malformed lines are skipped, not trusted.
  verified("2026-10-22T10:28:00.000Z", { task: "T2", exit: 0 }),
  verified("2026-10-22T10:29:00.000Z", { task: 7, cmd: "flutter test", exit: 0 }),
];

describe("progressOf", () => {
  it("lists the spec's tasks in order with what the state knows (AC1)", () => {
    const { tasks } = progressOf(SPEC, STATE, AUDIT);
    expect(tasks.map((task) => [task.id, task.status])).toEqual([
      ["T1", "done"],
      ["T2", "active"],
      ["T3", "pending"],
    ]);
    const [first, second, third] = tasks;
    expect(first).toMatchObject({
      title: "Composición del PDF",
      summary: "Plantilla del boletín con notas, promedios y observaciones.",
      commit: "a1b2c3d",
      files: ["lib/reports/pdf/report_card.dart"],
      criteria: ["AC1"],
      attempts: 1,
      doneAt: "2026-10-22T10:19:00.000Z",
    });
    expect(second?.attempts).toBe(2);
    expect(second?.commit).toBeUndefined();
    expect(third?.criteria).toEqual([]);
    expect(third?.attempts).toBe(0);
  });

  it("keeps each task's last verification; only a failure has output (AC2)", () => {
    const [first, second, third] = progressOf(SPEC, STATE, AUDIT).tasks;
    expect(first?.verification).toEqual({
      at: "2026-10-22T10:18:00.000Z",
      command: "flutter test",
      passed: true,
      ms: 18_000,
      output: [],
    });
    expect(second?.verification).toMatchObject({
      passed: false,
      ms: 12_000,
      output: ["Expected: 'Descargar PDF'", "Actual: 'Descargar'"],
    });
    expect(third?.verification).toBeUndefined();
  });

  it("puts each pending scope request with the task that asked for it (AC3)", () => {
    const [first, second] = progressOf(SPEC, STATE, []).tasks;
    expect(first?.scopeRequests).toEqual([]);
    expect(second?.scopeRequests).toEqual([
      { id: "S1", paths: ["lib/shared/pdf/layout.dart"], reason: "La firma." },
    ]);
  });

  it("marks a task ticked in the spec as done even without state", () => {
    const state: ChangeState = { ...STATE, tasks: {} };
    expect(progressOf(SPEC, state, []).tasks.map((task) => task.status)).toEqual([
      "done",
      "pending",
      "pending",
    ]);
  });
});

describe("durations", () => {
  const now = Date.parse("2026-10-22T10:32:00.000Z");

  it("counts a done task to its end, the active one to now, and nothing before it starts", () => {
    const [first, second, third] = progressOf(SPEC, STATE, []).tasks;
    expect(first && taskElapsed(first, now)).toBe(14 * 60_000);
    expect(second && taskElapsed(second, now)).toBe(12 * 60_000);
    expect(third && taskElapsed(third, now)).toBeUndefined();
    expect(workTime(progressOf(SPEC, STATE, []), now)).toBe(26 * 60_000);
  });

  it("reads like a person would say it, in both languages", () => {
    expect(formatDuration(400, "es")).toBe("menos de 1 s");
    expect(formatDuration(400, "en")).toBe("under 1 s");
    expect(formatDuration(18_000, "es")).toBe("18 s");
    expect(formatDuration(14 * 60_000, "es")).toBe("14 min");
    expect(formatDuration(65 * 60_000, "en")).toBe("1 h 5 min");
    expect(formatDuration(120 * 60_000, "es")).toBe("2 h");
  });
});
