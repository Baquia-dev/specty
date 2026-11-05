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
  it("AC1: shows the asker's own front: its first three free entries, in order, without the memory's total", () => {
    const text = card([owner("B"), owner("ui")], "B");
    expect(sectionOf(text, "MEMORIA DE SPECTY")).toEqual([
      "Las primeras entradas libres de tu frente, B, en su orden:",
      "P6 · mejora · Texto de P6",
      "P5 · pendiente · Texto de P5",
      "P4 · pendiente · Texto de P4",
      "No las empieces si el usuario no lo pide. Para tomar una, crea su cambio con `specty new` y cita su id en la petición.",
    ]);
    for (const outside of ["P1", "P3", "P7", "P2"]) expect(text).not.toContain(`${outside} ·`);
    expect(text).not.toContain("`specty memory`");
  });

  it("AC4: says so in English", () => {
    expect(sectionOf(card([owner("B")], "B", EN), "SPECTY'S MEMORY")).toEqual([
      "The first free entries of your front, B, in its order:",
      "P6 · improvement · Texto de P6",
      "P5 · pending · Texto de P5",
      "P4 · pending · Texto de P4",
      "Do not start them unless the user asks. To take one, create its change with `specty new` and cite its id in the request.",
    ]);
  });

  it("AC1: gives a conversation without a front of its own no entry, nor the fronts others hold", () => {
    for (const owners of [[owner("B"), owner("ui")], [owner("ui")], []]) {
      const text = card(owners);
      expect(sectionOf(text, "MEMORIA DE SPECTY")).toEqual([]);
      for (const id of ["P1", "P3", "P4", "P5", "P6", "P7"]) expect(text).not.toContain(`${id} ·`);
      expect(text).not.toContain("`specty front`");
    }
    expect(sectionOf(card([owner("ui")], undefined, EN), "SPECTY'S MEMORY")).toEqual([]);
  });

  it("AC1: says the asker's front has no free entry and to ask the person, with no other entry", () => {
    const text = card([owner("docs"), owner("B")], "docs");
    expect(sectionOf(text, "MEMORIA DE SPECTY")).toEqual([
      "Tu frente, docs, no tiene ninguna entrada libre: pregúntale a la persona qué sigue.",
    ]);
    for (const id of ["P1", "P3", "P4", "P5", "P6", "P7"]) expect(text).not.toContain(`${id} ·`);
  });

  it("AC4: says the asker's front has no free entry in English too", () => {
    expect(sectionOf(card([owner("docs")], "docs", EN), "SPECTY'S MEMORY")).toEqual([
      "Your front, docs, has no free entry: ask the person what comes next.",
    ]);
  });

  it("AC1: is the card of before when no front has a live owner and the asker holds none", () => {
    const before = renderText(nextCard({ dirty: [], memory: MEMORY }, ES), "es");
    expect(card([])).toBe(before);
    const english = renderText(nextCard({ dirty: [], memory: MEMORY }, EN), "en");
    expect(card([], undefined, EN)).toBe(english);
  });
});
