// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type ChangeView, nextCard, renderText, type TaskView } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };

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

const card = (change: Partial<ChangeView>, ctx = ES): string =>
  renderText(
    nextCard(
      {
        change: {
          id: "20261024-x",
          kind: "standard",
          phase: "implementing",
          title: "X",
          specPath: ".specty/changes/20261024-x/spec.md",
          revision: 1,
          tasks: [],
          conventions: [],
          pendingScope: [],
          rejected: [],
          closingSubmitted: false,
          specChanged: false,
          ...change,
        },
        dirty: [],
      },
      ctx,
    ),
    ctx.lang,
  );

const done = task("T1", "done", {
  summary: "Hecho",
  findings: ["La caché no se invalida al cambiar de curso.", "Falta un índice en notas."],
});

describe("findings", () => {
  it("show in the next task's card", () => {
    const text = card({ tasks: [done, task("T2", "active")] });
    expect(text).toContain(
      "HALLAZGOS:\n  T1: La caché no se invalida al cambiar de curso.\n  T1: Falta un índice en notas.",
    );
    expect(card({ tasks: [task("T1", "done"), task("T2", "active")] })).not.toContain("HALLAZGOS:");
  });

  it("show in the closing card, to carry the open ones to the follow-ups", () => {
    const text = card({ phase: "closing", tasks: [done] });
    expect(text).toContain(
      "HALLAZGOS DE LAS TAREAS:\n  T1: La caché no se invalida al cambiar de curso.\n  T1: Falta un índice en notas.\n  Lleva a ### Pendientes los que sigan abiertos: un cambio que siga a este con `--follows` los verá.",
    );
    expect(card({ phase: "closing", tasks: [task("T1", "done")] })).not.toContain("HALLAZGOS");
  });

  it("of the change this one follows show while drafting", () => {
    const text = card({
      phase: "draft",
      carried: [
        {
          id: "20261023-y",
          found: true,
          pending: ["Ordenar por fecha."],
          findings: [{ task: "T2", text: "La API pagina de 50 en 50." }],
        },
        { id: "20261022-z", found: false, pending: [], findings: [] },
      ],
    });
    expect(text).toContain(
      "DEL CAMBIO 20261023-y:\n  Pendiente: Ordenar por fecha.\n  Hallazgo de T2: La API pagina de 50 en 50.\n  Decide qué entra en esta spec; lo demás va a «Fuera de alcance».",
    );
    expect(text).toContain(
      "DEL CAMBIO 20261022-z:\n  No está en esta carpeta: si sigue abierto, vive en otra worktree.",
    );
    const english = card(
      { phase: "draft", carried: [{ id: "20261023-y", found: true, pending: [], findings: [] }] },
      { ...ES, lang: "en" },
    );
    expect(english).toContain("FROM CHANGE 20261023-y:\n  No follow-ups or findings.");
  });
});
