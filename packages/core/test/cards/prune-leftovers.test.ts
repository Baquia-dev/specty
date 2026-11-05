// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, pruneCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const NOTHING = { folders: [], branches: [], kept: [] };

describe("what `specty prune` says of what dead processes left", () => {
  it("AC2: says how many half-done writes, cut-off verifications and old git indexes it removed, in Spanish and in English", () => {
    const card = pruneCard({ ...NOTHING, leftovers: { writes: 2, runs: 1, indexes: 3 } }, ES);
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · limpieza",
        "RESTOS DE PROCESOS QUE MURIERON:",
        "  Escrituras a medias: 2.",
        "  Verificaciones cortadas: 1.",
        "  Índices temporales de git de más de una hora: 3.",
        'SIGUIENTE: para otro cambio, `specty new "<título>"`.',
      ].join("\n"),
    );
    const english = pruneCard({ ...NOTHING, leftovers: { writes: 1, runs: 4, indexes: 2 } }, EN);
    expect(renderText(english, "en")).toBe(
      [
        "SPECTY · cleanup",
        "LEFTOVERS OF PROCESSES THAT DIED:",
        "  Half-done writes: 1.",
        "  Cut-off verifications: 4.",
        "  Temporary git indexes over an hour old: 2.",
        'NEXT: for another change, `specty new "<title>"`.',
      ].join("\n"),
    );
  });

  it("AC1: names only the kinds it removed, after the record of units and before what it kept", () => {
    const card = pruneCard(
      {
        ...NOTHING,
        kept: ["/w/x"],
        units: { removed: 2, days: 30 },
        leftovers: { writes: 0, runs: 1, indexes: 0 },
      },
      ES,
    );
    const text = renderText(card, "es");
    expect(text).toContain("RESTOS DE PROCESOS QUE MURIERON:\n  Verificaciones cortadas: 1.\n");
    expect(text).not.toContain("Escrituras a medias");
    expect(text).not.toContain("Índices temporales de git");
    expect(text.indexOf("UNIDADES BORRADAS DEL REGISTRO:")).toBeLessThan(
      text.indexOf("RESTOS DE PROCESOS QUE MURIERON:"),
    );
    expect(text.indexOf("RESTOS DE PROCESOS QUE MURIERON:")).toBeLessThan(text.indexOf("QUEDAN:"));
  });

  it("AC1: leaves the section out when it removed nothing, and then there may be nothing to clean up", () => {
    const none = pruneCard({ ...NOTHING, leftovers: { writes: 0, runs: 0, indexes: 0 } }, ES);
    expect(renderText(none, "es")).not.toContain("RESTOS DE PROCESOS QUE MURIERON");
    expect(renderText(none, "es")).toContain("No había nada que limpiar.");
    const some = pruneCard({ ...NOTHING, leftovers: { writes: 1, runs: 0, indexes: 0 } }, ES);
    expect(renderText(some, "es")).not.toContain("No había nada que limpiar.");
  });
});
