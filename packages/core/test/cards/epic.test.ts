// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type ChangeView, nextCard, renderText, type SliceView } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const EPIC = "20261024-panel-del-estudiante";
const FOLDER = "/repos/app.worktrees/20261025-el-panel";

const slice = (
  id: string,
  status: SliceView["status"],
  extra: Partial<SliceView> = {},
): SliceView => ({ id, title: `Corte ${id}`, depends: [], status, ...extra });

const epic = (phase: ChangeView["phase"], slices: readonly SliceView[]): ChangeView => ({
  id: EPIC,
  kind: "epic",
  phase,
  title: "Panel del estudiante",
  specPath: `.specty/changes/${EPIC}/spec.md`,
  revision: 1,
  tasks: [],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  slices,
});

const card = (change: ChangeView, ctx = ES) =>
  renderText(nextCard({ change, dirty: [] }, ctx), ctx.lang);

const DONE = slice("C1", "done", { child: { id: "20261024-inicio", phase: "done" } });
const OPEN = slice("C2", "open", {
  depends: ["C1"],
  child: { id: "20261025-el-panel", phase: "implementing", folder: FOLDER },
});

describe("the epic card", () => {
  it("lists every slice with its state, and never asks for an accept (AC1)", () => {
    const text = card(
      epic("implementing", [
        DONE,
        OPEN,
        slice("C3", "ready"),
        slice("C4", "waiting", { depends: ["C2", "C3"] }),
      ]),
    );
    expect(text).toContain(
      [
        "CORTES (1 de 4 cerrados):",
        "  C1 Corte C1 — cerrado (20261024-inicio)",
        "  C2 Corte C2 — en curso: 20261025-el-panel, en implementing",
        "  C3 Corte C3 — listo para empezar",
        "  C4 Corte C4 — espera a C2, C3",
      ].join("\n"),
    );
    expect(text).toContain(
      `SIGUIENTE: sigue con el corte C2 en su carpeta, ${FOLDER}: ejecuta \`specty next\` allí.`,
    );
    expect(text).not.toContain("accept");
  });

  it("proposes the first ready slice when none is in progress (AC1)", () => {
    const text = card(epic("implementing", [DONE, slice("C2", "ready"), slice("C3", "ready")]));
    expect(text).toContain(
      `SIGUIENTE: empieza el corte C2: \`specty new "Corte C2" --epic ${EPIC} --slice C2\` y sigue su salida.`,
    );
    const english = card(epic("implementing", [slice("C1", "ready")]), EN);
    expect(english).toContain("SLICES (0 of 1 closed):\n  C1 Corte C1 — ready to start");
    expect(english).toContain(`\`specty new "Corte C1" --epic ${EPIC} --slice C1\``);
  });

  it("says when no slice can start (AC1)", () => {
    const stuck = card(epic("implementing", [slice("C1", "waiting", { depends: ["C2"] })]));
    expect(stuck).toContain("ningún corte puede empezar");
    expect(card(epic("implementing", [DONE]))).toContain(
      "SIGUIENTE: todos los cortes están cerrados: ejecuta `specty next`",
    );
  });

  it("lists the closed slices in the acceptance card (AC2)", () => {
    const text = card(epic("acceptance", [DONE]));
    expect(text).toContain("CORTES:\n  C1 Corte C1 — cerrado (20261024-inicio)");
    expect(text).not.toContain("TAREAS HECHAS");
  });
});
