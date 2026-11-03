// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, harvestedBlocks, type MemoryEntry } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const entry = (id: string, text: string): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-04T10:00:00.000Z",
  origin: { change: "20261104-a", by: "person" },
  text,
});

const LEFT = [
  entry("P59", "Ordenar por fecha.\nCon la más nueva primero."),
  entry("P60", "Exportar a CSV."),
];

describe("the pending items a closing leaves in the memory", () => {
  it("AC1: names each one with its first line, in order, and says sessions will see them", () => {
    expect(harvestedBlocks(LEFT, ES)).toEqual([
      {
        title: "PENDIENTES QUE QUEDAN EN LA MEMORIA",
        lines: [
          "P59 · Ordenar por fecha.",
          "P60 · Exportar a CSV.",
          "Las sesiones los verán al empezar; todos, con `specty memory`.",
        ],
      },
    ]);
    expect(harvestedBlocks(LEFT, EN)).toEqual([
      {
        title: "PENDING ITEMS LEFT IN THE MEMORY",
        lines: [
          "P59 · Ordenar por fecha.",
          "P60 · Exportar a CSV.",
          "Sessions will see them when they start; all of them, with `specty memory`.",
        ],
      },
    ]);
  });

  it("AC2: adds nothing when the closing left none", () => {
    expect(harvestedBlocks([], ES)).toEqual([]);
  });
});
