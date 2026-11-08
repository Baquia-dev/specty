// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type ChangeView, nextCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const OFF = { by: "Ana", at: "2026-11-08T10:05:00.000Z" };

/** A change in the middle of its implementation. */
const IMPLEMENTING: ChangeView = {
  id: "20261108-saludo",
  kind: "standard",
  phase: "implementing",
  title: "Saludo",
  specPath: ".specty/changes/20261108-saludo/spec.md",
  revision: 1,
  tasks: [],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
};

describe("the card of `specty next` with Specty off", () => {
  it("AC4: says since when and who turned it off, that nothing goes through Specty, and to work without the flow", () => {
    const card = nextCard({ dirty: [], off: OFF }, ES);
    expect(card.status).toBe("ok");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · apagado",
        "Specty está apagado desde el 2026-11-08 a las 10:05 UTC: lo apagó Ana.",
        "Nada de lo que hagas pasa por Specty: ni el guard, ni los hooks de git, ni el fin de turno.",
        "Los cambios abiertos siguen como están, y continúan cuando la persona lo vuelva a encender.",
        "SIGUIENTE: haz lo que pide el usuario sin spec ni comandos de Specty.",
      ].join("\n"),
    );
  });

  it("AC4: says it in English", () => {
    expect(renderText(nextCard({ dirty: [], off: OFF }, EN), "en")).toBe(
      [
        "SPECTY · off",
        "Specty has been off since 2026-11-08 at 10:05 UTC: Ana turned it off.",
        "Nothing you do goes through Specty: not the guard, the git hooks or the end of turn.",
        "Open changes stay as they are, and go on when the person turns it back on.",
        "NEXT: do what the user asks without a spec or Specty commands.",
      ].join("\n"),
    );
  });

  it("AC4: comes before any other card, also with a change or code without a spec", () => {
    for (const view of [
      { dirty: ["src/app.ts"], off: OFF },
      { dirty: [], fresh: true, off: OFF },
      { change: IMPLEMENTING, dirty: [], off: OFF },
    ]) {
      expect(renderText(nextCard(view, ES), "es")).toMatch(/^SPECTY · apagado\n/);
    }
  });

  it("AC6: without Specty off, gives the card of the change, of code without a spec or of no change, as always", () => {
    const change = renderText(nextCard({ change: IMPLEMENTING, dirty: [] }, ES), "es");
    expect(change).toMatch(/^SPECTY · 20261108-saludo · /);
    const dirty = renderText(nextCard({ dirty: ["src/app.ts"] }, ES), "es");
    expect(dirty).toContain("SPECTY\nCAMBIOS SIN SPEC:\n  src/app.ts");
    const idle = renderText(nextCard({ dirty: [] }, ES), "es");
    expect(idle).toContain("No hay un cambio activo.");
    for (const text of [change, dirty, idle]) expect(text).not.toContain("apagado");
  });
});
