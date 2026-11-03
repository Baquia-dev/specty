// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type Front,
  type FrontOwner,
  type MemoryEntry,
  renderText,
  statusCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const front = (name: string, items: readonly string[]): Front => ({
  name,
  created: "2026-11-04T10:00:00.000Z",
  origin: { by: "claude-code" },
  items,
  text: `Lo que abarca ${name}.`,
});

/** P3, taken, and P5, proposed for dropping, are still open; P1 is done and P6 dropped. */
const MEMORY = [
  entry("P1", { status: "done" }),
  entry("P2"),
  entry("P3", { status: "taken" }),
  entry("P4"),
  entry("P5", { status: "drop-proposed" }),
  entry("P6", { status: "dropped" }),
];

/** B holds P4, P1, P3 and P2 in that order; ui holds closed entries only. */
const FRONTS = [front("B", ["P4", "P1", "P3", "P2"]), front("ui", ["P6"])];

const OWNERS: readonly FrontOwner[] = [{ front: "B", tool: "claude-code", ago: 3 }];

const status = (ctx: CardContext = ES, fronts: readonly Front[] = FRONTS) =>
  statusCard([], ctx, MEMORY, { fronts, owners: OWNERS });

/** The lines of `text` under the section `title`, up to the next section or SIGUIENTE. */
const sectionOf = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

describe("the fronts in `specty status`", () => {
  it("AC5: shows each front with who holds it, or that it is free, and its open entries in order", () => {
    const text = renderText(status(), "es");
    expect(sectionOf(text, "FRENTES")).toEqual([
      "B · lo lleva claude-code, hace 3 min · abiertas: P4, P3, P2",
      "ui · libre · sin entradas abiertas",
    ]);
    expect(text.indexOf("CAMBIOS ABIERTOS:")).toBeLessThan(text.indexOf("FRENTES:"));
  });

  it("AC5: says it in English", () => {
    expect(sectionOf(renderText(status(EN), "en"), "FRONTS")).toEqual([
      "B · held by claude-code, 3 min ago · open: P4, P3, P2",
      "ui · free · no open entries",
    ]);
  });

  it("AC5: leaves the section out without fronts", () => {
    expect(renderText(status(ES, []), "es")).not.toContain("FRENTES");
    expect(renderText(statusCard([], ES, MEMORY), "es")).not.toContain("FRENTES");
  });

  it("AC6: carries each front as data: its name, its open entries in order and its live owner", () => {
    expect(status().fronts).toEqual([
      { name: "B", open: ["P4", "P3", "P2"], owner: { tool: "claude-code", ago: 3 } },
      { name: "ui", open: [] },
    ]);
    expect(status(ES, []).fronts).toEqual([]);
    expect(statusCard([], ES, MEMORY).fronts).toEqual([]);
  });
});
