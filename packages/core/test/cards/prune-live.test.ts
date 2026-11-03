// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, pruneCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const NOTHING = { folders: [], branches: [], kept: [] };

describe("what `specty prune` says of the memory's live half", () => {
  it("AC4: says how many activity records and whose messages it removed", () => {
    const card = pruneCard({ ...NOTHING, activity: 2, messages: ["20261101-viejo"] }, ES);
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · limpieza",
        "ACTIVIDAD BORRADA:",
        "  Registros de conversaciones que ya no trabajan: 2.",
        "MENSAJES BORRADOS:",
        "  20261101-viejo",
        'SIGUIENTE: para otro cambio, `specty new "<título>"`.',
      ].join("\n"),
    );
    const english = pruneCard({ ...NOTHING, activity: 1, messages: [] }, EN);
    expect(renderText(english, "en")).toBe(
      [
        "SPECTY · cleanup",
        "ACTIVITY REMOVED:",
        "  Records of conversations that no longer work: 1.",
        'NEXT: for another change, `specty new "<title>"`.',
      ].join("\n"),
    );
  });

  it("AC4: goes after the branches and before what it kept", () => {
    const card = pruneCard(
      { folders: ["/w/viejo"], branches: [], kept: ["/w/x"], messages: ["20261101-a"] },
      ES,
    );
    const text = renderText(card, "es");
    expect(text.indexOf("CARPETAS BORRADAS:")).toBeLessThan(text.indexOf("MENSAJES BORRADOS:"));
    expect(text.indexOf("MENSAJES BORRADOS:")).toBeLessThan(text.indexOf("QUEDAN:"));
  });

  it("AC4: says there was nothing to clean up only when nothing at all went", () => {
    expect(renderText(pruneCard({ ...NOTHING, activity: 0, messages: [] }, ES), "es")).toContain(
      "No había nada que limpiar.",
    );
    expect(renderText(pruneCard({ ...NOTHING, messages: ["x"] }, ES), "es")).not.toContain(
      "No había nada que limpiar.",
    );
  });
});
