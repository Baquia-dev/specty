// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import { answer } from "./derive.worker";
import { type ChangeRecord, relativeTime } from "./records";
import { decisionOf, deriveView, deriveViews, initialTab } from "./views";

const SPEC = `---
kind: standard
---

# Agrupar la evolución por trimestre

## Objetivo

El estudiante ve su evolución agrupada por trimestre.

## Fuera de alcance

- Ninguno

## Supuestos

- A1: Las series ya llegan del backend.
  - impacto: alto
- A2: Un trimestre son tres meses.
  - impacto: alto
- A3: Basta con el gráfico actual.

## Criterios de aceptación

- AC1: CUANDO el estudiante elige "Por trimestre" ENTONCES ve un punto por trimestre.

## Archivos

- modificar lib/home/provider.dart — agrupación

## Tareas

- [ ] T1: Agrupar por trimestre
  - files: lib/home/provider.dart
  - ac: AC1
  - verify: flutter test
`;

const HASH = `sha256:${"a".repeat(64)}`;

function state(overrides: Partial<ChangeState> = {}): ChangeState {
  return {
    schema: 1,
    id: "20261020-evolucion-trimestre",
    kind: "standard",
    phase: "review",
    branch: "specty/20261020-evolucion-trimestre",
    revision: 2,
    items: { A1: { hash: HASH, decision: "confirmed" } },
    tasks: {},
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
    ...overrides,
  };
}

const record = (overrides: Partial<ChangeState> = {}, spec = SPEC): ChangeRecord => ({
  spec,
  state: state(overrides),
  phaseSince: "2026-10-21T10:00:00.000Z",
});

describe("deriveView", () => {
  it("reads title, phase, revision, branch, size, effort and goal (AC4)", () => {
    const view = deriveView(record());
    expect(view.title).toBe("Agrupar la evolución por trimestre");
    expect([view.phase, view.revision, view.branch]).toEqual([
      "review",
      2,
      "specty/20261020-evolucion-trimestre",
    ]);
    expect(view.goal).toContain("evolución agrupada");
    expect(view.size?.level).toBe("S");
    expect(view.size?.reasons[0]).toEqual({ es: "1 archivo", en: "1 file" });
    expect(view.effort).toEqual({ plan: expect.any(String), implement: expect.any(String) });
    expect(view.tasks).toEqual({ done: 0, total: 1 });
    expect(view.progress.tasks.map((task) => [task.id, task.status])).toEqual([["T1", "pending"]]);
    expect(view.problems).toEqual([]);
    expect(view.tab).toBe("spec");
  });

  it("carries the folder it lives in, and the files it shares with other open changes (AC1, AC2)", () => {
    const folder = "/Users/ana/mi-colegio.worktrees/20261020-evolucion-trimestre";
    expect(deriveView({ ...record(), folder }).folder).toBe(folder);
    expect(deriveView(record()).folder).toBeUndefined();
    const other = record({ id: "20261021-otro" }, SPEC.replace("# Agrupar", "# Otro: agrupar"));
    const [mine, theirs] = deriveViews([record(), other]);
    expect(mine?.shared).toEqual([
      {
        path: "lib/home/provider.dart",
        changes: [{ id: "20261021-otro", title: "Otro: agrupar la evolución por trimestre" }],
      },
    ]);
    expect(theirs?.shared?.[0]?.changes[0]?.id).toBe("20261020-evolucion-trimestre");
    expect(deriveViews([record()])[0]?.shared).toBeUndefined();
  });

  it("carries the approved revision: which one, when and by whom", () => {
    const at = "2026-10-21T15:02:11.000Z";
    const approved = { revision: 1, hash: HASH, at, by: "Ana Gómez", channel: "ui" } as const;
    expect(deriveView(record({ approved })).approved).toEqual({ revision: 1, at, by: "Ana Gómez" });
    expect(deriveView(record()).approved).toBeUndefined();
    const delegated = { ...approved, channel: "delegated" } as const;
    expect(deriveView(record({ approved: delegated })).approved).toEqual({
      revision: 1,
      at,
      by: "Ana Gómez",
      delegated: true,
    });
  });

  it("counts high-impact assumptions still undecided in review (AC2)", () => {
    expect(deriveView(record()).highImpactPending).toBe(1);
    const decided = record({
      items: {
        A1: { hash: HASH, decision: "confirmed" },
        A2: { hash: HASH, decision: "rejected", comment: "No: son periodos del colegio." },
      },
    });
    expect(deriveView(decided).highImpactPending).toBe(0);
    expect(deriveView(record({ phase: "implementing" })).highImpactPending).toBe(0);
  });

  it("shows scope requests with task, paths and reason (AC2)", () => {
    const view = deriveView(
      record({
        phase: "implementing",
        pending: {
          scopeRequests: [
            {
              id: "S1",
              task: "T1",
              paths: ["lib/shared/chart.dart"],
              reason: "Necesita el eje común.",
            },
          ],
          adjustment: null,
        },
      }),
    );
    expect(view.decision).toBe("scope");
    expect(view.scopeRequests).toEqual([
      { id: "S1", task: "T1", paths: ["lib/shared/chart.dart"], reason: "Necesita el eje común." },
    ]);
  });

  it("reports what it cannot read instead of failing", () => {
    const broken = { ...record(), state: { ...state(), revision: -1 } };
    expect(deriveView(broken).problems[0]).toContain("state.json");
    const empty = deriveView(record({}, "texto sin formato"));
    expect(empty.problems.some((problem) => problem.startsWith("spec.md"))).toBe(true);
    expect(empty.title).toBe("20261020-evolucion-trimestre");
  });
});

describe("decisions and tabs", () => {
  it("knows what each phase waits for", () => {
    expect(decisionOf(state({ phase: "review" }))).toBe("review");
    expect(decisionOf(state({ phase: "implementing" }))).toBeUndefined();
    expect(decisionOf(state({ phase: "acceptance" }))).toBe("acceptance");
    expect(decisionOf(state({ phase: "closing" }))).toBeUndefined();
    expect(
      decisionOf(state({ phase: "closing", closingSubmittedAt: "2026-10-21T10:00:00.000Z" })),
    ).toBe("closing");
  });

  it("waits for the agent once the person asked for changes, until the next proposal (AC1, AC3)", () => {
    const step = (ts: string, event: string, revision: number) => ({
      ts,
      actor: "human" as const,
      event,
      data: { revision },
    });
    const asked = [
      step("2026-10-20T14:00:00Z", "spec.proposed", 1),
      step("2026-10-20T15:00:00Z", "review.changes_requested", 1),
    ];
    const view = deriveView({ ...record({ phase: "review", revision: 1 }), audit: asked });
    expect([view.decision, view.changesRequested]).toEqual([
      undefined,
      { revision: 1, at: "2026-10-20T15:00:00Z" },
    ]);
    const proposed = [...asked, step("2026-10-20T16:00:00Z", "spec.proposed", 2)];
    const next = deriveView({ ...record({ phase: "review", revision: 2 }), audit: proposed });
    expect([next.decision, next.changesRequested]).toEqual(["review", undefined]);
  });

  it("carries the findings, and the last review of the spec and of the result (AC1, AC2, AC3)", () => {
    const review = (target: "spec" | "diff", revision: number, at: string, text: string) => ({
      target,
      revision,
      at,
      text,
    });
    const view = deriveView({
      ...record({ phase: "acceptance" }),
      audit: [
        {
          ts: "2026-10-24T10:00:00Z",
          actor: "agent",
          event: "task.completed",
          data: { task: "T1", findings: ["Falta un índice."] },
        },
      ],
      reviews: [
        review("spec", 1, "2026-10-20T10:00:00Z", "Primera."),
        review("spec", 2, "2026-10-21T10:00:00Z", "Segunda."),
        review("diff", 2, "2026-10-22T10:00:00Z", "El resultado."),
      ],
    });
    expect(view.findings).toEqual([{ task: "T1", text: "Falta un índice." }]);
    expect(view.specReview?.text).toBe("Segunda.");
    expect(view.resultReview).toMatchObject({ revision: 2, text: "El resultado." });
    const plain = deriveView(record());
    expect([plain.findings, plain.specReview, plain.resultReview]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("carries the history from the audit, oldest first", () => {
    expect(deriveView(record()).history).toEqual([]);
    const audit = [
      {
        ts: "2026-10-20T14:00:00Z",
        actor: "agent",
        tool: "codex",
        event: "spec.proposed",
        data: { revision: 2 },
      },
      {
        ts: "2026-10-20T15:00:00Z",
        actor: "human",
        event: "spec.approved",
        data: { revision: 2, channel: "tty" },
      },
    ] as const;
    const history = deriveView({ ...record(), audit }).history;
    expect(history.map((entry) => [entry.at, entry.actor, entry.type, entry.title.es])).toEqual([
      ["2026-10-20T14:00:00Z", "agent", "spec", "Propuso la revisión 2"],
      ["2026-10-20T15:00:00Z", "human", "spec", "Aprobó la revisión 2"],
    ]);
    expect(history[0]?.tool).toBe("codex");
    expect(history[1]?.details.map((detail) => detail.en)).toEqual(["In the terminal"]);
  });

  it("carries the closing the agent wrote, in its parts (AC1)", () => {
    expect(deriveView(record()).closing).toBeUndefined();
    const closing = `${SPEC}
## Cierre

### Resumen

Evolución agrupada por trimestre.

### Pendientes

- Exportar el gráfico.
`;
    const view = deriveView(record({ phase: "closing" }, closing));
    expect(view.closing).toEqual({
      summary: "Evolución agrupada por trimestre.",
      deviations: "",
      decisions: "",
      pending: "- Exportar el gráfico.",
      other: "",
    });
    // An empty section is no closing yet.
    expect(
      deriveView(record({ phase: "closing" }, `${SPEC}\n## Cierre\n\n`)).closing,
    ).toBeUndefined();
  });

  it("opens each phase on its tab (AC4)", () => {
    expect(
      (
        [
          "draft",
          "review",
          "implementing",
          "adjusting",
          "acceptance",
          "closing",
          "done",
          "cancelled",
        ] as const
      ).map(initialTab),
    ).toEqual([
      "spec",
      "spec",
      "progress",
      "progress",
      "acceptance",
      "acceptance",
      "history",
      "history",
    ]);
  });

  it("AC4: opens the testing phase on the progress tab", () => {
    expect(initialTab("testing")).toBe("progress");
  });
});

describe("derivation worker (AC7, AC10)", () => {
  it("answers with the same views as the on-demand path, as plain data", () => {
    const records = [record(), record({ phase: "acceptance" })];
    const response = answer({ id: 7, records });
    expect(response.id).toBe(7);
    expect(response.views).toEqual(deriveViews(records));
    expect(structuredClone(response)).toEqual(response);
  });

  it("listens for requests and posts the views back", () => {
    const post = vi.spyOn(globalThis, "postMessage").mockImplementation(() => undefined);
    dispatchEvent(new MessageEvent("message", { data: { id: 1, records: [record()] } }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    post.mockRestore();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  it("writes how long ago in the chosen language", () => {
    expect(relativeTime("2026-10-21T11:48:00.000Z", now, "es")).toBe("hace 12 min");
    expect(relativeTime("2026-10-21T11:48:00.000Z", now, "en")).toBe("12 min. ago");
    expect(relativeTime("2026-10-21T09:00:00.000Z", now, "es")).toBe("hace 3 h");
    expect(relativeTime("2026-10-19T12:00:00.000Z", now, "en")).toBe("2 days ago");
    expect(relativeTime("2026-10-21T11:59:50.000Z", now, "es")).toBe("este minuto");
  });
});
