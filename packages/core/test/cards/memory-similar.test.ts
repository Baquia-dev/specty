// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type MemoryEntry, memorySimilarCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

/** An open pending item of Specty's memory. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const FOUND = [
  entry("P2", { kind: "improvement", text: "El test embebido falla a veces\ncon más texto" }),
  entry("P5", { text: "Falla a veces el test embebido" }),
];

describe("the card of a `memory add` that may repeat an open entry", () => {
  it("AC1: writes nothing and names each one with its kind and first line", () => {
    const card = memorySimilarCard(FOUND, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toContain(
      "SPECTY · memoria\nNo se anotó porque puede repetir una entrada abierta:\n  P2 · mejora · El test embebido falla a veces\n  P5 · pendiente · Falla a veces el test embebido\n",
    );
  });

  it("AC1, AC2: says not to add or mention the same one, and how to add it with --distinct-from if it is different", () => {
    expect(renderText(memorySimilarCard(FOUND, ES), "es")).toContain(
      "SIGUIENTE: si es la misma, no la añadas ni se la menciones al usuario, y sigue con `specty next`; si es distinta, vuelve a ejecutar `specty memory add` con `--distinct-from P2 P5`.",
    );
    expect(renderText(memorySimilarCard(FOUND.slice(1), ES), "es")).toContain(
      "con `--distinct-from P5`.",
    );
  });

  it("AC5: says the same in English", () => {
    const out = renderText(memorySimilarCard(FOUND, EN), "en");
    expect(out).toContain(
      "SPECTY · memory\nNot added, as it may repeat an open entry:\n  P2 · improvement · El test embebido falla a veces\n  P5 · pending · Falla a veces el test embebido\n",
    );
    expect(out).toContain(
      "NEXT: if it is the same one, do not add it or mention it to the user, and go on with `specty next`; if it is different, run `specty memory add` again with `--distinct-from P2 P5`.",
    );
  });
});
