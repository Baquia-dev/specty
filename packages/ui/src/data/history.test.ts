// SPDX-License-Identifier: Apache-2.0
import { historyOf } from "./history";
import type { AuditRecord } from "./progress";

let minute = 0;
const event = (
  actor: AuditRecord["actor"],
  name: string,
  data: Readonly<Record<string, unknown>> = {},
  tool?: string,
): AuditRecord => ({
  ts: new Date(Date.UTC(2026, 9, 20, 14, minute++)).toISOString(),
  actor,
  ...(tool === undefined ? {} : { tool }),
  event: name,
  data,
});

/** «title · detail · detail» in Spanish, to read a whole entry at once. */
const said = (audit: readonly AuditRecord[]) =>
  historyOf(audit).map((entry) =>
    [entry.title.es, ...entry.details.map((detail) => detail.es)].join(" · "),
  );

describe("historyOf", () => {
  it("tells a change from its creation to its closing, oldest first (AC1, AC3)", () => {
    const audit = [
      event(
        "agent",
        "change.created",
        { kind: "standard", branch: "specty/x", follows: ["20261018-a"] },
        "claude-code",
      ),
      event("agent", "spec.proposed", { revision: 1, size: "M", warnings: 2 }, "claude-code"),
      event("human", "assumption.decided", {
        item: "A2",
        decision: "rejected",
        comment: "Por trimestres.",
      }),
      event("human", "review.changes_requested", { revision: 1, comments: ["c1", "c2"] }),
      event("agent", "spec.proposed", { revision: 2, size: "M", warnings: 0 }),
      event("human", "spec.approved", { revision: 2, hash: "sha256:x", channel: "ui" }),
      event("agent", "task.started", { task: "T1", baseCommit: "5d2a7b0" }),
      event("specty", "task.verified", { task: "T1", cmd: "flutter test", exit: 0, ms: 12_000 }),
      event("agent", "task.completed", { task: "T1", commit: "3c9d1e2", summary: "Agregados." }),
      event("specty", "change.verified", {
        cmd: "flutter analyze && flutter test",
        exit: 1,
        ms: 9_000,
      }),
      event("human", "change.accepted", { revision: 2 }),
      event("agent", "spec.proposed", { revision: 2 }),
      event("human", "change.closed", {}),
    ];
    expect(said(audit)).toEqual([
      "Creó el cambio · Carril estándar · Rama specty/x · Sigue a 20261018-a",
      "Propuso la revisión 1 · Tamaño M · 2 avisos",
      "Rechazó A2 · Por trimestres.",
      "Pidió cambios en la revisión 1 · 2 comentarios",
      "Propuso la revisión 2 · Tamaño M",
      "Aprobó la revisión 2 · Desde la UI",
      "Empezó T1 · Desde 5d2a7b0",
      "T1: verificación correcta · 12 s · flutter test",
      "Terminó T1 · Commit 3c9d1e2 · Agregados.",
      "Verificación completa fallida · 9 s · flutter analyze && flutter test",
      "Aceptó el resultado · Revisión 2",
      // After accepting, a proposal is the closing the agent sends.
      "Envió el cierre",
      "Cerró el cambio",
    ]);
    const entries = historyOf(audit);
    expect(entries.map((entry) => entry.type)).toEqual([
      "spec",
      "spec",
      "spec",
      "spec",
      "spec",
      "spec",
      "tasks",
      "verifications",
      "tasks",
      "verifications",
      "closing",
      "closing",
      "closing",
    ]);
    expect(entries[0]).toMatchObject({
      actor: "agent",
      tool: "claude-code",
      event: "change.created",
    });
    expect(entries[0]?.at).toBe(audit[0]?.ts);
    expect(entries[2]).not.toHaveProperty("tool");
    expect(entries[5]?.title.en).toBe("Approved revision 2");
    expect(entries[11]?.title.en).toBe("Sent the closing");
  });

  it("reads scope requests and decisions in every shape they come in", () => {
    const request = {
      id: "S1",
      task: "T3",
      paths: ["lib/a.dart", "lib/b.dart"],
      reason: "Hace falta.",
    };
    expect(
      said([
        event("agent", "scope.requested", { request }),
        event("agent", "scope.requested", { request: "S2", task: "T3" }),
        event("human", "scope.decided", { id: "S1", decision: "approved" }),
        event("human", "scope.decided", {
          request: "S2",
          decision: "rejected",
          reason: "Usa el otro.",
        }),
        event("specty", "scope.decided", {
          task: "T1",
          paths: ["lib/c.dart"],
          reason: "Tests.",
          decision: "auto",
        }),
      ]),
    ).toEqual([
      "Pidió ampliar el alcance de T3 · S1 · lib/a.dart, lib/b.dart · Hace falta.",
      "Pidió ampliar el alcance de T3 · S2",
      "Aprobó la solicitud S1",
      "Rechazó la solicitud S2 · Usa el otro.",
      "Aprobó la ampliación por la política del proyecto · lib/c.dart · Tests.",
    ]);
    expect(historyOf([event("agent", "scope.requested", { request })])[0]?.type).toBe("scope");
  });

  it("tells adjustments, cancellations, retros and quick changes", () => {
    const entries = historyOf([
      event("human", "adjust.requested", { request: "No se cumple AC2: falta el curso." }),
      event("agent", "adjust.classified", { items: { AC2: "defect" } }),
      event("human", "assumption.decided", { rejected: ["A1", "A3"] }),
      event("human", "change.cancelled", { reason: "Ya no hace falta." }),
      event("specty", "retro.confirmed", { mode: "minimal" }),
      event("human", "change.closed", { lane: "quick" }),
    ]);
    expect(
      entries.map((entry) => [entry.title.es, ...entry.details.map((d) => d.es)].join(" · ")),
    ).toEqual([
      "Pidió ajustes · No se cumple AC2: falta el curso.",
      "Clasificó los ajustes",
      "Rechazó A1, A3",
      "Canceló el cambio · Ya no hace falta.",
      "Confirmó la retro · Mínima: solo el índice",
      "Cerró el cambio · Cambio rápido: se cierra al aceptarlo",
    ]);
    expect(entries.map((entry) => entry.type)).toEqual([
      "adjustments",
      "adjustments",
      "spec",
      "closing",
      "closing",
      "closing",
    ]);
  });

  it("AC3: tells the tests sent, approved and locked, and each unlock, with contract", () => {
    const audit = [
      event("agent", "tests.proposed", {
        count: 2,
        files: ["test/a_test.dart", "test/b_test.dart"],
        red: [{ cmd: "flutter test", exit: 1 }],
      }),
      event("human", "tests.approved", { channel: "ui" }),
      event("agent", "tests.proposed", { count: 1, files: ["test/bug_test.dart"] }),
      event("specty", "tests.locked", { count: 1 }),
      event("human", "scope.decided", {
        id: "S2",
        decision: "approved",
        unlock: ["test/a_test.dart"],
        task: "T2",
      }),
      event("human", "spec.approved", {
        revision: 3,
        channel: "tty",
        unlocked: ["test/a_test.dart", "test/b_test.dart"],
      }),
      event("specty", "tests.locked", {}),
    ];
    expect(said(audit)).toEqual([
      "Envió 2 tests para aprobar · test/a_test.dart, test/b_test.dart · En rojo: flutter test",
      "Aprobó los tests · Desde la UI",
      "Envió 1 test para aprobar · test/bug_test.dart",
      "Bloqueó 1 test en rojo",
      "Aprobó la solicitud S2 · Desbloquea para T2: test/a_test.dart",
      "Aprobó la revisión 3 · En la terminal · Desbloquea los tests de los criterios modificados: test/a_test.dart, test/b_test.dart",
      "Bloqueó los tests en rojo",
    ]);
    expect(historyOf(audit).map((entry) => entry.type)).toEqual([
      "verifications",
      "spec",
      "verifications",
      "verifications",
      "scope",
      "spec",
      "verifications",
    ]);
    expect(historyOf(audit)[0]?.title.en).toBe("Sent 2 tests for approval");
  });

  it("keeps an unknown event or incomplete data, with what it can read (AC2)", () => {
    const entries = historyOf([
      event("specty", "guard.blocked", { path: "src/a.ts" }),
      event("human", "spec.approved", {}),
      event("specty", "task.verified", { task: "T2", exit: "0", ms: "fast" }),
      event("agent", "task.started", { task: 3 }),
      event("agent", "change.created", { kind: "galaxy", follows: "not a list" }),
      event("agent", "spec.proposed", { revision: "two", warnings: 1 }),
    ]);
    expect(entries.map((entry) => [entry.type, entry.title.es, entry.details.length])).toEqual([
      ["other", "guard.blocked", 0],
      ["spec", "Aprobó la spec", 0],
      ["verifications", "T2: verificación", 0],
      ["tasks", "Empezó una tarea", 0],
      ["spec", "Creó el cambio", 0],
      ["spec", "Propuso la spec", 1],
    ]);
    expect(entries[0]?.title.en).toBe("guard.blocked");
    expect(historyOf([])).toEqual([]);
  });

  it("says which decisions the agent took for the person, in delegated mode (AC2)", () => {
    const delegated = { delegated: true };
    const audit = [
      event("agent", "spec.approved", { revision: 1, channel: "delegated", ...delegated }),
      event("agent", "scope.decided", { id: "S1", decision: "approved", ...delegated }),
      event("agent", "change.accepted", { revision: 1, ...delegated }),
      event("human", "change.closed", {}),
    ];
    expect(said(audit)).toEqual([
      "Aprobó la revisión 1 · Por delegación: lo decidió el agente",
      "Aprobó la solicitud S1 · Por delegación: lo decidió el agente",
      "Aceptó el resultado · Revisión 1 · Por delegación: lo decidió el agente",
      "Cerró el cambio",
    ]);
    expect(historyOf(audit)[0]?.details.map((detail) => detail.en)).toEqual([
      "Delegated: the agent decided",
    ]);
  });
});
