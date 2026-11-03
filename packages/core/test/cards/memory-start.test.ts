// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type MemoryEntry, nextCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

let day = 0;

/** An entry of the memory, a day after the one before unless `created` says otherwise. */
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

/** The card of `next` with no active change, as the agent reads it. */
const card = (memory: readonly MemoryEntry[], ctx: CardContext = ES, dirty: string[] = []) =>
  renderText(nextCard({ dirty, memory }, ctx), ctx.lang);

/** The same card before Specty had a memory. */
const plain = (ctx: CardContext = ES, dirty: string[] = []) =>
  renderText(nextCard({ dirty }, ctx), ctx.lang);

/** The lines of `text` under the section `title`, up to the next section or SIGUIENTE. */
const sectionOf = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

describe("the memory in next's card with no active change", () => {
  it("AC1: counts the open pending items and improvements and shows the first three free ones by date", () => {
    const memory = [
      entry("P4", { kind: "improvement", text: "Una mejora\ncon una segunda línea" }),
      entry("P2"),
      entry("P7", { status: "taken" }),
      entry("P5"),
      entry("P6", { status: "drop-proposed" }),
      entry("P3"),
      entry("P1", { status: "done" }),
      entry("P8", { status: "dropped" }),
      entry("P9", { kind: "reminder" }),
      entry("D1", { kind: "decision", quote: "así" }),
    ];
    const lines = sectionOf(card(memory), "MEMORIA DE SPECTY");
    expect(lines[0]).toContain("6");
    expect(lines.slice(1, 4)).toEqual([
      "P4 · mejora · Una mejora",
      "P2 · pendiente · Texto de P2",
      "P5 · pendiente · Texto de P5",
    ]);
    const text = card(memory);
    for (const hidden of ["P7", "P6", "P3", "P1", "P8", "D1"]) {
      expect(text).not.toContain(`${hidden} ·`);
    }
  });

  it("AC1: explains how to take one and how to see them all, without starting them on its own", () => {
    const how = sectionOf(card([entry("P1")]), "MEMORIA DE SPECTY").at(-1) ?? "";
    expect(how).toContain("`specty new`");
    expect(how).toContain("`specty memory`");
    expect(how).toContain("usuario");
    const en = sectionOf(card([entry("P1")], EN), "SPECTY'S MEMORY");
    expect(en[1]).toBe("P1 · pending · Texto de P1");
    expect(en.at(-1)).toContain("`specty new`");
    expect(en.at(-1)).toContain("`specty memory`");
    expect(en.at(-1)).toContain("user");
  });

  it("AC2: shows every open reminder, and how to mark one done", () => {
    const memory = [
      entry("P1", { kind: "reminder", text: "Recompilar el dist de main" }),
      entry("P2", { kind: "reminder", status: "done" }),
      entry("P3", { kind: "reminder" }),
      entry("P4", { kind: "reminder" }),
      entry("P5", { kind: "reminder" }),
    ];
    const lines = sectionOf(card(memory), "RECORDATORIOS");
    expect(lines.slice(0, -1)).toEqual([
      "P1 · Recompilar el dist de main",
      "P3 · Texto de P3",
      "P4 · Texto de P4",
      "P5 · Texto de P5",
    ]);
    expect(lines.at(-1)).toContain("`specty memory done <id>`");
    // With reminders only, there is no section of pending items.
    expect(sectionOf(card(memory), "MEMORIA DE SPECTY")).toEqual([]);
    const en = sectionOf(card(memory, EN), "REMINDERS");
    expect(en[0]).toBe("P1 · Recompilar el dist de main");
    expect(en.at(-1)).toContain("`specty memory done <id>`");
  });

  it("AC2: goes after the pending items, and both after the card's own text", () => {
    const text = card([entry("P1", { kind: "reminder" }), entry("P2")]);
    const memory = text.indexOf("MEMORIA DE SPECTY:");
    const reminders = text.indexOf("RECORDATORIOS:");
    expect(text.indexOf("No hay un cambio activo.")).toBeLessThan(memory);
    expect(memory).toBeLessThan(reminders);
    expect(text.split("\n").at(-1)).toBe(plain().split("\n").at(-1));
  });

  it("AC3: is the card of before when nothing is open", () => {
    expect(card([])).toBe(plain());
    expect(card([], EN)).toBe(plain(EN));
    const closed = [
      entry("P1", { status: "done" }),
      entry("P2", { status: "dropped" }),
      entry("P3", { kind: "reminder", status: "done" }),
      entry("D1", { kind: "decision", quote: "sí" }),
    ];
    expect(card(closed)).toBe(plain());
  });

  it("AC3: keeps the next step of the card without a spec, with the memory after its own text", () => {
    const dirty = ["src/app.ts"];
    const text = card([entry("P1")], ES, dirty);
    expect(text.startsWith(plain(ES, dirty).split("\n").slice(0, -1).join("\n"))).toBe(true);
    expect(text.split("\n").at(-1)).toBe(plain(ES, dirty).split("\n").at(-1));
    expect(text).toContain("P1 · pendiente · Texto de P1");
  });
});
