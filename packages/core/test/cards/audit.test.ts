// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type AuditEvent, type AuditView, auditReport } from "../../src";

const event = (
  ts: string,
  actor: string,
  name: string,
  data: Readonly<Record<string, unknown>> = {},
  tool?: string,
): AuditEvent => ({ ts, actor, event: name, data, ...(tool === undefined ? {} : { tool }) });

const VIEW: AuditView = {
  id: "20261024-saludo-personalizado",
  title: "Saludo personalizado",
  kind: "standard",
  phase: "done",
  branch: "specty/20261024-saludo-personalizado",
  request: "que salude por nombre",
  approved: { revision: 2, at: "2026-10-24T10:10:00.000Z", by: "Ana", channel: "tty" },
  tasks: [
    {
      id: "T1",
      title: "Saludar por nombre",
      status: "done",
      commit: "a1b2c3d",
      summary: "Saluda | por nombre",
    },
    { id: "T2", title: "Mensaje por defecto", status: "pending" },
  ],
  events: [
    event(
      "2026-10-24T10:00:00.000Z",
      "agent",
      "change.created",
      { kind: "standard" },
      "claude-code",
    ),
    event("2026-10-24T10:05:00.000Z", "agent", "spec.proposed", { revision: 2 }),
    event("2026-10-24T10:10:00.000Z", "human", "spec.approved", { revision: 2, channel: "tty" }),
    event("2026-10-24T10:12:00.000Z", "specty", "task.verified", {
      task: "T1",
      cmd: "pnpm check",
      exit: 0,
      ms: 125_000,
    }),
    event("2026-10-24T10:13:00.000Z", "agent", "task.completed", {
      task: "T1",
      summary: "Saluda por nombre",
    }),
    event("2026-10-24T10:20:00.000Z", "agent", "change.accepted", { revision: 2, delegated: true }),
    event("2026-10-24T10:21:00.000Z", "specty", "algo.nuevo"),
  ],
};

describe("the audit report", () => {
  it("has the change, its tasks and its timeline, each event in words (AC1)", () => {
    const { markdown } = auditReport(VIEW, "es");
    for (const line of [
      "# Auditoría: Saludo personalizado",
      "- Cambio: `20261024-saludo-personalizado` · standard · fase done",
      "- Rama: `specty/20261024-saludo-personalizado`",
      "- Petición: «que salude por nombre»",
      "- Aprobada: revisión 2, 2026-10-24 10:10, por Ana (tty)",
      "| T1 Saludar por nombre | hecha | a1b2c3d | Saluda \\| por nombre |",
      "| T2 Mensaje por defecto | pendiente | — | — |",
      "| 2026-10-24 10:00 | agente (claude-code) | Creó el cambio (standard) |",
      "| 2026-10-24 10:05 | agente | Propuso la revisión 2 |",
      "| 2026-10-24 10:10 | persona | Aprobó la revisión 2 (tty) |",
      "| 2026-10-24 10:12 | specty | Verificó T1: `pnpm check`, código 0, 2 min 5 s |",
      "| 2026-10-24 10:13 | agente | Completó T1: Saluda por nombre |",
      "| 2026-10-24 10:20 | agente, por delegación | Aceptó el resultado |",
      "| 2026-10-24 10:21 | specty | algo.nuevo |",
    ]) {
      expect(markdown).toContain(line);
    }
  });

  it("speaks English too, and gives the same as data for --json (AC2)", () => {
    const { markdown, json } = auditReport(VIEW, "en");
    expect(markdown).toContain("# Audit: Saludo personalizado");
    expect(markdown).toContain("| 2026-10-24 10:10 | person | Approved revision 2 (tty) |");
    expect(markdown).toContain("| 2026-10-24 10:20 | agent, delegated | Accepted the result |");
    const { tasks, events, ...change } = VIEW;
    expect(json).toEqual({ change, tasks, events });
  });

  it("puts every event of formats.md §4 in words, in both languages (AC1)", () => {
    const named: readonly [string, Readonly<Record<string, unknown>>][] = [
      ["assumption.decided", { rejected: ["A1"] }],
      ["review.changes_requested", { revision: 1 }],
      ["task.started", { task: "T1" }],
      ["scope.requested", { id: "S1", task: "T1", paths: ["a.ts"], reason: "falta" }],
      ["scope.decided", { id: "S1", decision: "approved" }],
      ["epic.slicesDone", { slices: {} }],
      ["adjust.requested", { request: "más rápido" }],
      ["adjust.classified", {}],
      ["review.completed", { target: "spec", exit: 0 }],
      ["review.completed", { target: "diff", exit: 1 }],
      ["change.verified", { cmd: "pnpm check", exit: null, ms: 600_000 }],
      ["retro.confirmed", {}],
      ["change.closed", {}],
      ["change.cancelled", { reason: "ya no hace falta" }],
      ["integration.started", { target: "main" }],
      ["integration.resolved", {}],
      ["integration.abandoned", {}],
    ];
    for (const lang of ["es", "en"] as const) {
      const view = {
        ...VIEW,
        tasks: [],
        events: named.map(([name, data]) =>
          event("2026-10-24T11:00:00.000Z", "specty", name, data),
        ),
      };
      const lines = auditReport(view, lang)
        .markdown.split("\n")
        .filter((line) => line.startsWith("| 2026"));
      expect(lines).toHaveLength(named.length);
      // Each one in words, not by its name.
      lines.forEach((line, index) => expect(line).not.toContain(named[index]?.[0] ?? ""));
    }
    const spanish = auditReport({ ...VIEW, tasks: [], events: [] }, "es").markdown;
    expect(spanish).toContain("## Tareas\n\nSin tareas.");
  });
});
