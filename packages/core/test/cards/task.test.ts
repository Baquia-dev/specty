// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  autoApprovedLead,
  type CardContext,
  type ChangeView,
  inScopeLead,
  renderText,
  scopeAddRefusalCard,
  type TaskView,
  taskDoneCard,
  taskDoneRefusalCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261020-saludo · implementing";

const task = (id: string, status: TaskView["status"], extra: Partial<TaskView> = {}): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status,
  files: ["src/a.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
  ...extra,
});

const change = (tasks: TaskView[]): ChangeView => ({
  id: "20261020-saludo",
  kind: "standard",
  phase: "implementing",
  title: "Saludo",
  specPath: ".specty/changes/20261020-saludo/spec.md",
  revision: 1,
  tasks,
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
});

describe("the cards of a refused `task done`", () => {
  it("send the agent to `next` when there is no such task to complete", () => {
    const none = taskDoneRefusalCard({ reason: "not-implementing" }, "SPECTY", ES);
    expect(renderText(none, "es")).toBe(
      "SPECTY\nNo hay ninguna tarea en implementación.\nSIGUIENTE: ejecuta `specty next`.",
    );
    const other = taskDoneRefusalCard({ reason: "not-active", task: "T2" }, HEADER, EN);
    expect(other.status).toBe("blocked");
    expect(renderText(other, "en")).toContain(
      "T2 is not the active task.\nNEXT: run `specty next`.",
    );
  });

  it("are invalid for a note that is too long or empty", () => {
    const long = taskDoneRefusalCard(
      { reason: "too-long", note: "summary", length: 320 },
      HEADER,
      ES,
    );
    expect(long.status).toBe("invalid");
    expect(long.blocks[0]?.lines).toEqual([
      "El resumen tiene 320 caracteres; el máximo es 300, porque las tarjetas de las tareas siguientes lo repiten.",
    ]);
    expect(long.next).toBe(
      "dilo en una o dos frases (el detalle ya está en el commit) y vuelve a ejecutar `task done`.",
    );
    const finding = taskDoneRefusalCard(
      { reason: "too-long", note: "finding", length: 301 },
      HEADER,
      EN,
    );
    expect(finding.blocks[0]?.lines[0]).toMatch(/^A finding has 301 characters; the most is 300/);
    const empty = taskDoneRefusalCard({ reason: "empty", note: "summary", task: "T1" }, HEADER, ES);
    expect(empty.status).toBe("invalid");
    expect(renderText(empty, "es")).toContain(
      'Falta el resumen (--summary).\nSIGUIENTE: ejecuta `specty task done T1 --summary "<qué hiciste>"`.',
    );
    const blank = taskDoneRefusalCard({ reason: "empty", note: "finding", task: "T1" }, HEADER, EN);
    expect(blank.blocks[0]?.lines).toEqual(["A finding (--finding) is empty."]);
    expect(blank.next).toBe('run `specty task done T1 --summary "<what you did>"`.');
  });

  it("wait for the person's decision on a scope request", () => {
    const card = taskDoneRefusalCard(
      { reason: "scope-pending", task: "T1", request: "S2" },
      HEADER,
      ES,
    );
    expect(card.blocks[0]?.lines).toEqual(["T1 espera la decisión sobre S2."]);
    expect(card.next).toBe(
      "sigue dentro del alcance y pide al usuario `specty approve --scope S2`.",
    );
  });
});

describe("a completed task", () => {
  it("leads with its commit, before the card of what comes next", () => {
    const card = taskDoneCard(
      change([task("T1", "done"), task("T2", "active")]),
      "T1",
      "a1b2c3d",
      ES,
    );
    const text = renderText(card, "es");
    expect(text).toMatch(
      /^SPECTY · 20261020-saludo · implementing · tarea 2 de 2\nT1 completada: commit a1b2c3d\./,
    );
    expect(text).not.toContain("AVISOS");
  });

  it("warns about what it removed, risked or left long, with what to do about each", () => {
    const done = task("T1", "done", {
      removedAssertions: [{ path: "test/a.test.ts", removed: 2 }],
      longFiles: [{ path: "src/a.ts", lines: 320, before: 290, limit: 300, severity: "warning" }],
    });
    const text = renderText(
      taskDoneCard(change([done, task("T2", "active")]), "T1", "a1b2c3d", EN),
      "en",
    );
    expect(text).toContain(
      [
        "T1 done: commit a1b2c3d.",
        "WARNINGS:",
        "  T1 removed 2 assertions from test/a.test.ts, a test that already existed.",
        "  If it was not part of the task, explain it to the user: they will see it on acceptance.",
        "  T1: src/a.ts, 320 lines of code (warning past 300).",
        "  If a file mixes responsibilities, propose how to split it before going on; never split it just to meet the number.",
      ].join("\n"),
    );
  });
});

describe("the cards of `scope add`", () => {
  it("send the agent to `next` outside the implementation or without an active task", () => {
    const outside = scopeAddRefusalCard({ reason: "not-implementing" }, "SPECTY", ES);
    expect(renderText(outside, "es")).toBe(
      "SPECTY\nSolo se amplía el alcance durante la implementación.\nSIGUIENTE: ejecuta `specty next`.",
    );
    expect(
      scopeAddRefusalCard({ reason: "not-active", task: "T3" }, HEADER, EN).blocks[0]?.lines,
    ).toEqual(["T3 is not active."]);
    expect(
      scopeAddRefusalCard({ reason: "not-active", task: "" }, HEADER, ES).blocks[0]?.lines,
    ).toEqual(["La tarea no está activa."]);
  });

  it("are invalid without valid paths or a reason, and say how to ask", () => {
    const invalid = scopeAddRefusalCard(
      { reason: "invalid-paths", paths: ["../x", "/etc"], task: "T1" },
      HEADER,
      ES,
    );
    expect(invalid.status).toBe("invalid");
    expect(invalid.blocks[0]?.lines).toEqual(["Rutas no válidas: ../x, /etc."]);
    expect(invalid.next).toBe('ejecuta `specty scope add <ruta> --task T1 --reason "<motivo>"`.');
    const incomplete = scopeAddRefusalCard({ reason: "incomplete", task: "T1" }, HEADER, EN);
    expect(incomplete.blocks[0]?.lines).toEqual([
      "Give at least one path and the reason (--reason).",
    ]);
    expect(incomplete.next).toBe('run `specty scope add <path> --task T1 --reason "<reason>"`.');
  });

  it("lead with what was already in scope or what the policy approved", () => {
    expect(inScopeLead(ES)).toBe("Esas rutas ya están dentro del alcance.");
    expect(inScopeLead(EN)).toBe("Those paths are already within the scope.");
    const approved = [
      { path: "src/a.test.ts", planned: false, tasks: [] },
      { path: "src/b.ts", planned: true, tasks: [] },
      { path: "src/c.ts", planned: true, tasks: ["T2", "T3"] },
    ];
    expect(autoApprovedLead(approved, ES)).toBe(
      "Ampliación aprobada por la política: src/a.test.ts, src/b.ts (ya en Archivos), src/c.ts (ya en Archivos, prevista para T2, T3).",
    );
    expect(autoApprovedLead(approved, EN)).toBe(
      "Extension approved by policy: src/a.test.ts, src/b.ts (already in Files), src/c.ts (already in Files, planned for T2, T3).",
    );
  });
});
