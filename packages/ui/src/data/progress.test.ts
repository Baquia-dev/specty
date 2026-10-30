// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import {
  type AuditRecord,
  formatClock,
  formatDuration,
  outputSegments,
  progressOf,
  taskElapsed,
  workTime,
} from "./progress";

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

  it("AC2: marks the approved tests a scope request asks to unlock", () => {
    const test = "test/boletin_test.dart";
    const state: ChangeState = {
      ...STATE,
      lockedTests: { [test]: `sha256:${"c".repeat(64)}` },
      pending: {
        scopeRequests: [{ id: "S2", task: "T2", paths: [test], reason: "Esperaba otro título." }],
        adjustment: null,
      },
    };
    expect(progressOf(SPEC, state, []).tasks[1]?.scopeRequests).toEqual([
      { id: "S2", paths: [test], reason: "Esperaba otro título.", unlocks: [test] },
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

  it("keeps the last full verification, only when the project has one (AC1, AC3, AC5)", () => {
    const full = "flutter analyze && flutter test";
    const changeVerified = (ts: string, data: Record<string, unknown>): AuditRecord => ({
      ts,
      actor: "specty",
      event: "change.verified",
      data,
    });
    const audit = [
      ...AUDIT,
      changeVerified("2026-10-22T11:00:00.000Z", {
        cmd: full,
        exit: 1,
        ms: 9_000,
        outputTail: ["00:09 +37 -1: Some tests failed."],
      }),
      changeVerified("2026-10-22T11:05:00.000Z", { cmd: full, exit: 0, ms: 41_000 }),
      // Malformed lines are skipped, not trusted.
      changeVerified("2026-10-22T11:06:00.000Z", { exit: 0 }),
    ];
    expect(progressOf(SPEC, STATE, audit, full).full).toEqual({
      command: full,
      last: { at: "2026-10-22T11:05:00.000Z", command: full, passed: true, ms: 41_000, output: [] },
    });
    expect(progressOf(SPEC, STATE, audit.slice(0, -2), full).full?.last).toMatchObject({
      passed: false,
      output: ["00:09 +37 -1: Some tests failed."],
    });
    // Never run yet; and with no `verify.full`, nothing to show.
    expect(progressOf(SPEC, STATE, AUDIT, full).full).toEqual({ command: full });
    expect(progressOf(SPEC, STATE, audit).full).toBeUndefined();
    // A full verification is no task's verification.
    expect(progressOf(SPEC, STATE, audit, full).tasks[0]?.verification?.at).toBe(
      "2026-10-22T10:18:00.000Z",
    );
  });

  it("AC3: reads the coverage a full verification kept, and none from a malformed one", () => {
    const full = "flutter analyze && flutter test";
    const coverage = {
      measured: 130,
      covered: 120,
      gaps: [{ path: "lib/a.dart", from: 10, to: 14 }],
      stretches: 1,
    };
    const last = (data: Record<string, unknown>) =>
      progressOf(
        SPEC,
        STATE,
        [
          ...AUDIT,
          {
            ts: "2026-10-22T11:05:00.000Z",
            actor: "specty",
            event: "change.verified",
            data: { cmd: full, exit: 0, ms: 41_000, ...data },
          },
        ],
        full,
      ).full?.last;
    expect(last({ coverage })).toMatchObject({ coverage });
    // A malformed stretch is dropped; the rest stays.
    const odd = { ...coverage, gaps: [{ path: "lib/a.dart", from: "10" }, ...coverage.gaps] };
    expect(last({ coverage: odd })).toMatchObject({ coverage: { gaps: coverage.gaps } });
    for (const bad of [
      "92 %",
      { ...coverage, measured: "130" },
      { ...coverage, gaps: "none" },
      { measured: 130, covered: 120 },
    ]) {
      expect(last({ coverage: bad })).not.toHaveProperty("coverage");
    }
    expect(last({})).not.toHaveProperty("coverage");
  });
});

describe("outputSegments", () => {
  const tones = (line: string) =>
    outputSegments(line).map((segment) => [segment.tone, segment.text]);

  it("colors failures, passes, locations and timings, and keeps the text whole (AC2)", () => {
    const line = "00:07 +6 -1: report card footer shows the signature [E]";
    expect(tones(line)).toEqual([
      ["muted", "00:07"],
      ["plain", " "],
      ["pass", "+6"],
      ["plain", " "],
      ["fail", "-1"],
      ["plain", ": report card footer shows the signature "],
      ["fail", "[E]"],
    ]);
    expect(
      outputSegments(line)
        .map((segment) => segment.text)
        .join(""),
    ).toBe(line);
    expect(tones("  lib/reports/pdf/report_card.dart:12:8")).toEqual([
      ["plain", "  "],
      ["path", "lib/reports/pdf/report_card.dart:12:8"],
    ]);
    expect(tones("00:09 +7: All tests passed!")).toEqual([
      ["muted", "00:09"],
      ["plain", " "],
      ["pass", "+7"],
      ["plain", ": "],
      ["pass", "All tests passed!"],
    ]);
    expect(tones("  Error: Couldn't resolve it.")[1]).toEqual(["fail", "Error"]);
    expect(tones("Some tests failed.")).toEqual([
      ["plain", "Some tests "],
      ["fail", "failed"],
      ["plain", "."],
    ]);
    expect(tones(" ✕ AC1: parses spec")[1]).toEqual(["fail", "✕"]);
    expect(tones(" ✖ should fail")[1]).toEqual(["fail", "✖"]);
    expect(tones(" ✔ should pass")[1]).toEqual(["pass", "✔"]);
    expect(tones("  AssertionError: expected false to be true")[1]).toEqual([
      "fail",
      "AssertionError",
    ]);
    expect(tones("FAILURES: 1 failure")[0]).toEqual(["fail", "FAILURES"]);
  });

  it("reads an assertion's expected and actual lines whole", () => {
    expect(tones("  Expected: 'Descargar PDF'")).toEqual([["pass", "  Expected: 'Descargar PDF'"]]);
    expect(tones("    Actual: 'Descargar'")).toEqual([["fail", "    Actual: 'Descargar'"]]);
    expect(tones("  Received: 3")).toEqual([["fail", "  Received: 3"]]);
    expect(tones("  - Expected   - 1")).toEqual([["pass", "  - Expected   - 1"]]);
    expect(tones("  + Received   + 1")).toEqual([["fail", "  + Received   + 1"]]);
    expect(tones("  - 'Descargar PDF'")).toEqual([["pass", "  - 'Descargar PDF'"]]);
    expect(tones("  + 'Descargar'")).toEqual([["fail", "  + 'Descargar'"]]);
    expect(tones("  - true")).toEqual([["pass", "  - true"]]);
    expect(tones("  + false")).toEqual([["fail", "  + false"]]);
  });

  it("leaves alone what it does not recognize, like dates or words with numbers", () => {
    expect(tones("Compiling 2026-10-22 build v2-1")).toEqual([
      ["plain", "Compiling 2026-10-22 build v2-1"],
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

  it("counts a running verification like a clock (AC1)", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(42_400)).toBe("0:42");
    expect(formatClock(12 * 60_000 + 5_000)).toBe("12:05");
    expect(formatClock(3_930_000)).toBe("1:05:30");
    expect(formatClock(-5)).toBe("0:00");
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
