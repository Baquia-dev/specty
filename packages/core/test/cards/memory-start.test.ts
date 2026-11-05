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
  it("AC1: neither lists nor counts the open pending items and improvements, nor points to specty memory", () => {
    const memory = [
      entry("P4", { kind: "improvement", text: "Una mejora\ncon una segunda línea" }),
      entry("P2"),
      entry("P7", { status: "taken" }),
      entry("P5"),
      entry("P6", { status: "drop-proposed" }),
      entry("D1", { kind: "decision", quote: "así" }),
    ];
    for (const ctx of [ES, EN]) {
      const text = card(memory, ctx);
      expect(text).toBe(plain(ctx));
      for (const hidden of ["P4", "P2", "P7", "P5", "P6", "D1"]) {
        expect(text).not.toContain(`${hidden} ·`);
      }
      expect(text).not.toContain("`specty memory`");
    }
    expect(sectionOf(card(memory), "MEMORIA DE SPECTY")).toEqual([]);
    expect(sectionOf(card(memory, EN), "SPECTY'S MEMORY")).toEqual([]);
  });

  it("AC1: shows every open reminder, and how to mark one done, without the pending items", () => {
    const memory = [
      entry("P1", { kind: "reminder", text: "Recompilar el dist de main" }),
      entry("P2", { kind: "reminder", status: "done" }),
      entry("P3", { kind: "reminder" }),
      entry("P4", { kind: "reminder" }),
      entry("P5", { kind: "reminder" }),
      entry("P6"),
      entry("P7", { kind: "improvement" }),
    ];
    const lines = sectionOf(card(memory), "RECORDATORIOS");
    expect(lines.slice(0, -1)).toEqual([
      "P1 · Recompilar el dist de main",
      "P3 · Texto de P3",
      "P4 · Texto de P4",
      "P5 · Texto de P5",
    ]);
    expect(lines.at(-1)).toContain("`specty memory done <id>`");
    expect(sectionOf(card(memory), "MEMORIA DE SPECTY")).toEqual([]);
    for (const hidden of ["P6", "P7"]) expect(card(memory)).not.toContain(`${hidden} ·`);
  });

  it("AC4: shows the reminders in English too", () => {
    const memory = [
      entry("P1", { kind: "reminder", text: "Recompilar el dist de main" }),
      entry("P2"),
    ];
    const en = sectionOf(card(memory, EN), "REMINDERS");
    expect(en[0]).toBe("P1 · Recompilar el dist de main");
    expect(en.at(-1)).toContain("`specty memory done <id>`");
    expect(sectionOf(card(memory, EN), "SPECTY'S MEMORY")).toEqual([]);
  });

  it("AC1: puts the reminders after the card's own text, keeping its next step", () => {
    const text = card([entry("P1", { kind: "reminder" }), entry("P2")]);
    expect(text.indexOf("No hay un cambio activo.")).toBeLessThan(text.indexOf("RECORDATORIOS:"));
    expect(text).not.toContain("P2 ·");
    expect(text.split("\n").at(-1)).toBe(plain().split("\n").at(-1));
  });

  it("AC1: is the card of before when nothing is open", () => {
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

  it("AC1: keeps the next step of the card without a spec, with the reminders after its own text", () => {
    const dirty = ["src/app.ts"];
    const text = card([entry("P1", { kind: "reminder" }), entry("P2")], ES, dirty);
    expect(text.startsWith(plain(ES, dirty).split("\n").slice(0, -1).join("\n"))).toBe(true);
    expect(text.split("\n").at(-1)).toBe(plain(ES, dirty).split("\n").at(-1));
    expect(text).toContain("P1 · Texto de P1");
    expect(text).not.toContain("P2 ·");
  });
});
