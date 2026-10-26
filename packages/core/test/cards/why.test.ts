// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, renderText, type WhyView, whyCard } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const TASKED: WhyView["commits"][number] = {
  commit: "a1b2c3d",
  date: "2026-10-20",
  author: "Ana",
  subject: "feat(app): Saludar por nombre",
  change: {
    id: "20261020-saludo-personalizado",
    title: "Saludo personalizado",
    task: { id: "T1", title: "Saludar por nombre" },
    criteria: [{ id: "AC1", text: "CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana»." }],
    spec: "r2@4be1c2d",
  },
};

const card = (view: WhyView, ctx = ES) => renderText(whyCard(view, ctx), ctx.lang);

describe("the why card", () => {
  it("says the commit, the change, the task, its criteria and the spec revision (AC1)", () => {
    const text = card({ target: "src/app.ts:3", commits: [TASKED] });
    expect(text).toContain(
      [
        "src/app.ts:3:",
        "  a1b2c3d · 2026-10-20 · Ana · feat(app): Saludar por nombre",
        "    Cambio 20261020-saludo-personalizado: Saludo personalizado",
        "    Tarea T1: Saludar por nombre",
        "    AC1: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».",
        "    Spec: revisión 2 (4be1c2d)",
      ].join("\n"),
    );
    expect(text).toContain("SIGUIENTE: para ver el commit entero, `git show a1b2c3d`.");
    expect(card({ target: "src/app.ts:3", commits: [TASKED] }, EN)).toContain(
      "    Change 20261020-saludo-personalizado: Saludo personalizado\n    Task T1: Saludar por nombre",
    );
  });

  it("lists the changes of a file, and names those outside Specty or not found here (AC2, AC3)", () => {
    const outside = { commit: "f00ba12", date: "2026-10-01", author: "Ana", subject: "Inicio" };
    const elsewhere = {
      ...outside,
      commit: "c0ffee1",
      change: { id: "20261015-otro", criteria: [] },
    };
    const text = card({ target: "src/app.ts", commits: [TASKED, elsewhere, outside] });
    expect(text).toContain(
      "  c0ffee1 · 2026-10-01 · Ana · Inicio\n    Cambio 20261015-otro (no está en esta carpeta)",
    );
    expect(text).toContain(
      "  f00ba12 · 2026-10-01 · Ana · Inicio\n    No es de ningún cambio de Specty.",
    );
  });

  it("says when the line is in no commit yet (AC3)", () => {
    const text = card({ target: "src/app.ts:9", uncommitted: true, commits: [] });
    expect(text).toContain("src/app.ts:9: la línea aún no está en ningún commit.");
  });
});
