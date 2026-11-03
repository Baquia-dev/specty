// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type Front,
  type FrontOwner,
  type MemoryEntry,
  nextCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

let day = 0;

/** A pending item of the memory, a day after the one before. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => {
  day += 1;
  return {
    id,
    kind: "pending",
    status: "open",
    created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    origin: { by: "claude-code" },
    text: `Texto de ${id}`,
    ...extra,
  };
};

const front = (name: string, items: readonly string[]): Front => ({
  name,
  created: "2026-11-04T10:00:00.000Z",
  origin: { by: "claude-code" },
  items,
  text: `Lo que abarca ${name}.`,
});

/** P1 to P7 by date: P2 is taken and P6 an improvement; B holds P6, P2, P5 and P4, in that order. */
const MEMORY = [
  entry("P1"),
  entry("P2", { status: "taken" }),
  entry("P3"),
  entry("P4"),
  entry("P5"),
  entry("P6", { kind: "improvement" }),
  entry("P7"),
];

const FRONTS = [front("B", ["P6", "P2", "P5", "P4"]), front("ui", ["P7"]), front("docs", [])];

const owner = (name: string): FrontOwner => ({ front: name, tool: "claude-code", ago: 2 });

/** The card of `next` with no active change, with the fronts, who holds them and the asker's. */
const card = (
  owners: readonly FrontOwner[],
  own?: string,
  ctx: CardContext = ES,
  memory: readonly MemoryEntry[] = MEMORY,
) =>
  renderText(
    nextCard(
      { dirty: [], memory, fronts: { fronts: FRONTS, owners, ...(own ? { own } : {}) } },
      ctx,
    ),
    ctx.lang,
  );

/** The lines of `text` under the section `title`, up to the next section or SIGUIENTE. */
const sectionOf = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

describe("the memory in the card with no active change, with fronts", () => {
  it("AC1: shows the asker's own front: its first three free entries, in the front's order", () => {
    const lines = sectionOf(card([owner("B"), owner("ui")], "B"), "MEMORIA DE SPECTY");
    expect(lines.slice(0, 4)).toEqual([
      "Pendientes y mejoras abiertas: 7. Las primeras libres de tu frente, B, en su orden:",
      "P6 · mejora · Texto de P6",
      "P5 · pendiente · Texto de P5",
      "P4 · pendiente · Texto de P4",
    ]);
    const text = card([owner("B"), owner("ui")], "B");
    for (const outside of ["P1", "P3", "P7", "P2"]) expect(text).not.toContain(`${outside} ·`);
    expect(lines.at(-1)).toContain("`specty new`");
  });

  it("AC1: says so in English", () => {
    const lines = sectionOf(card([owner("B")], "B", EN), "SPECTY'S MEMORY");
    expect(lines[0]).toBe(
      "Open pending items and improvements: 7. The first free ones of your front, B, in its order:",
    );
    expect(lines[1]).toBe("P6 · improvement · Texto de P6");
  });

  it("AC2: leaves out the entries of the fronts other sessions hold, and names those fronts", () => {
    const lines = sectionOf(card([owner("B"), owner("ui")]), "MEMORIA DE SPECTY");
    expect(lines.slice(0, 4)).toEqual([
      "Pendientes y mejoras abiertas: 7. Las primeras libres:",
      "P1 · pendiente · Texto de P1",
      "P3 · pendiente · Texto de P3",
      "Las de los frentes con dueño (B, ui) no salen aquí: `specty front` dice quién los lleva.",
    ]);
    const en = sectionOf(card([owner("ui")], undefined, EN), "SPECTY'S MEMORY");
    expect(en.slice(0, 4)).toEqual([
      "Open pending items and improvements: 7. The first free ones:",
      "P1 · pending · Texto de P1",
      "P3 · pending · Texto de P3",
      "P4 · pending · Texto de P4",
    ]);
    expect(en[4]).toBe(
      "Those of the fronts with an owner (ui) are left out: `specty front` says who holds them.",
    );
  });

  it("AC2: says none is free when every free entry belongs to a front with an owner", () => {
    const memory = [entry("P4"), entry("P5"), entry("P7")];
    const lines = sectionOf(
      card([owner("B"), owner("ui")], undefined, ES, memory),
      "MEMORIA DE SPECTY",
    );
    expect(lines[0]).toBe("Pendientes y mejoras abiertas: 3; ninguna está libre.");
    expect(lines[1]).toBe(
      "Las de los frentes con dueño (B, ui) no salen aquí: `specty front` dice quién los lleva.",
    );
  });

  it("AC3: says the asker's front has no free entry and to ask the person, with no other entry", () => {
    const text = card([owner("docs"), owner("B")], "docs");
    const lines = sectionOf(text, "MEMORIA DE SPECTY");
    expect(lines[0]).toBe(
      "Pendientes y mejoras abiertas: 7; tu frente, docs, no tiene ninguna libre: pregúntale a la persona qué sigue.",
    );
    for (const id of ["P1", "P3", "P4", "P5", "P6", "P7"]) expect(text).not.toContain(`${id} ·`);
    expect(sectionOf(card([owner("docs")], "docs", EN), "SPECTY'S MEMORY")[0]).toBe(
      "Open pending items and improvements: 7; your front, docs, has none free: ask the person what comes next.",
    );
  });

  it("AC4: is the card of before when no front has a live owner and the asker holds none", () => {
    const before = renderText(nextCard({ dirty: [], memory: MEMORY }, ES), "es");
    expect(card([])).toBe(before);
    const english = renderText(nextCard({ dirty: [], memory: MEMORY }, EN), "en");
    expect(card([], undefined, EN)).toBe(english);
  });
});
