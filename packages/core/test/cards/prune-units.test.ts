// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, pruneCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const NOTHING = { folders: [], branches: [], kept: [] };

describe("what `specty prune` says of the record of units", () => {
  it("AC3: says how many units it removed from the record and after how many days, in Spanish and in English", () => {
    const card = pruneCard({ ...NOTHING, units: { removed: 3, days: 30 } }, ES);
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · limpieza",
        "UNIDADES BORRADAS DEL REGISTRO:",
        "  Anotadas hace más de 30 días: 3.",
        'SIGUIENTE: para otro cambio, `specty new "<título>"`.',
      ].join("\n"),
    );
    const english = pruneCard({ ...NOTHING, units: { removed: 1, days: 30 } }, EN);
    expect(renderText(english, "en")).toBe(
      [
        "SPECTY · cleanup",
        "UNITS REMOVED FROM THE RECORD:",
        "  Recorded more than 30 days ago: 1.",
        'NEXT: for another change, `specty new "<title>"`.',
      ].join("\n"),
    );
  });

  it("AC3: goes after the messages and before what it kept", () => {
    const card = pruneCard(
      { ...NOTHING, kept: ["/w/x"], messages: ["20261101-a"], units: { removed: 2, days: 30 } },
      ES,
    );
    const text = renderText(card, "es");
    expect(text.indexOf("MENSAJES BORRADOS:")).toBeLessThan(
      text.indexOf("UNIDADES BORRADAS DEL REGISTRO:"),
    );
    expect(text.indexOf("UNIDADES BORRADAS DEL REGISTRO:")).toBeLessThan(text.indexOf("QUEDAN:"));
  });

  it("AC3: leaves the section out when it removed none, and then there may be nothing to clean up", () => {
    const none = renderText(pruneCard({ ...NOTHING, units: { removed: 0, days: 30 } }, ES), "es");
    expect(none).not.toContain("UNIDADES BORRADAS DEL REGISTRO");
    expect(none).toContain("No había nada que limpiar.");
    const some = renderText(pruneCard({ ...NOTHING, units: { removed: 1, days: 30 } }, ES), "es");
    expect(some).not.toContain("No había nada que limpiar.");
  });
});
