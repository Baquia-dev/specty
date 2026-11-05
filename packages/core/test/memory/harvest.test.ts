// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { harvestable, type MemoryEntry } from "../../src";

/** An open pending item. */
const entry = (id: string, text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text,
  ...extra,
});

const EMPTY = { entries: [], ids: [] };

describe("the follow-ups of a closing that go to the memory", () => {
  it("AC1: are each bullet, trimmed, in order", () => {
    expect(harvestable(["Ordenar por fecha.", "  Exportar a CSV  "], EMPTY)).toEqual([
      "Ordenar por fecha.",
      "Exportar a CSV",
    ]);
  });

  it("AC1: keep a bullet that cites an id the memory does not have", () => {
    expect(harvestable(["Como P99, pero con fechas."], { entries: [], ids: ["P1"] })).toEqual([
      "Como P99, pero con fechas.",
    ]);
  });

  it("AC2: leave out a bullet that cites an entry of the memory, readable or not", () => {
    const memory = {
      entries: [entry("P2", "Dos"), entry("D1", "Rama", { kind: "decision", quote: "sí" })],
      ids: ["P2", "D1", "P5"],
    };
    const items = [
      "P2: sigue pendiente.",
      "Lo decidido en D1, aplicado al guard.",
      "P5 en otra forma.",
      "Nuevo.",
    ];
    expect(harvestable(items, memory)).toEqual(["Nuevo."]);
  });

  it("AC2: leave out a bullet that says there are none, and empty ones", () => {
    const items = [
      "Ninguno.",
      "ninguna",
      "None.",
      "none",
      "  ",
      "Ninguno pendiente de X, salvo Y.",
    ];
    expect(harvestable(items, EMPTY)).toEqual(["Ninguno pendiente de X, salvo Y."]);
  });

  it("AC3: leave out a bullet whose first sentence says there are none, also with more after it", () => {
    const items = [
      "Ninguno nuevo.",
      "Ninguno nuevo. C6 hará que `GET /api/changes` dé solo los abiertos.",
      "No hay.",
      "Nada pendiente",
      "Ninguna más: lo demás quedó hecho.",
      "**Ningún pendiente nuevo.**",
      "Sin pendientes.",
      "None.",
      "None new: the rest is done.",
      "Nothing new",
      "Nothing pending.",
    ];
    expect(harvestable(items, EMPTY)).toEqual([]);
  });

  it("AC3: keep a bullet that only starts like one that says there are none", () => {
    const items = [
      "Ninguno, salvo revisar el guard.",
      "No hay tests de la UI para la Memoria.",
      "Nada más que probar el CLI de main.",
      "Nothing checks the closing's size again.",
      "None of the reminders fire on cancel: decide whether they should.",
    ];
    expect(harvestable(items, EMPTY)).toEqual(items);
  });

  it("AC2: leave out the text of an open entry, and a bullet repeated", () => {
    const memory = {
      entries: [
        entry("P1", "Ordenar por fecha."),
        entry("P2", "Hecho ya.", {
          status: "done",
          closed: { at: "2026-11-02T10:00:00.000Z", by: "person" },
        }),
      ],
      ids: ["P1", "P2"],
    };
    const items = ["Ordenar por fecha.", "Exportar a CSV.", "Exportar a CSV.", "Hecho ya."];
    expect(harvestable(items, memory)).toEqual(["Exportar a CSV.", "Hecho ya."]);
  });
});
