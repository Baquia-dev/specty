// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  nextCard,
  notedCard,
  noteRefusalCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

/** `next`'s card of a change in `phase`, as the agent reads it. */
const card = (change: Partial<ChangeView>, ctx = ES): string =>
  renderText(
    nextCard(
      {
        change: {
          id: "20261103-x",
          kind: "standard",
          phase: "implementing",
          title: "X",
          specPath: ".specty/changes/20261103-x/spec.md",
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

const NOTES = [
  { at: "2026-11-03T14:05:12.000Z", text: "La API pagina de 50 en 50." },
  { at: "2026-11-03T15:00:00.000Z", text: "Probé con caché\ny no sirve." },
];

describe("the change's log", () => {
  it("AC2: shows its notes in next's card, with date and time, in every phase", () => {
    for (const phase of ["draft", "implementing", "acceptance"] as const) {
      expect(card({ phase, notes: NOTES })).toContain(
        "BITÁCORA:\n  2026-11-03 14:05 · La API pagina de 50 en 50.\n  2026-11-03 15:00 · Probé con caché\n",
      );
    }
    expect(card({ notes: NOTES }, EN)).toContain(
      "LOG:\n  2026-11-03 14:05 · La API pagina de 50 en 50.\n",
    );
  });

  it("AC2: leaves the card as it was without notes", () => {
    expect(card({ notes: [] })).toBe(card({}));
    expect(card({})).not.toContain("BITÁCORA");
  });

  it("AC1: confirms a note added", () => {
    const text = renderText(notedCard("20261103-x", "La API pagina de 50 en 50.", ES), "es");
    expect(text).toContain("Nota anotada en la bitácora de 20261103-x.");
    expect(text).toContain("SIGUIENTE: sigue con `specty next`.");
    expect(renderText(notedCard("20261103-x", "x", EN), "en")).toContain(
      "Note added to the log of 20261103-x.",
    );
  });

  it("AC3: says why nothing was added", () => {
    const empty = noteRefusalCard({ reason: "empty" }, ES);
    expect(empty.status).not.toBe("ok");
    expect(renderText(empty, "es")).toContain("La nota está vacía.");
    expect(renderText(empty, "es")).toContain(
      'SIGUIENTE: vuelve a ejecutar `specty note "<texto>"` con el texto.',
    );
    const none = renderText(noteRefusalCard({ reason: "no-change" }, ES), "es");
    expect(none).toContain(
      "No hay un cambio abierto en esta carpeta: la bitácora es de un cambio.",
    );
    expect(none).toContain(
      "SIGUIENTE: entra en la carpeta del cambio, o anota lo pendiente con `specty memory add`.",
    );
    expect(renderText(noteRefusalCard({ reason: "no-change" }, EN), "en")).toContain(
      "There is no open change in this folder: the log belongs to a change.",
    );
    expect(renderText(noteRefusalCard({ reason: "empty" }, EN), "en")).toContain(
      "The note is empty.",
    );
  });
});
