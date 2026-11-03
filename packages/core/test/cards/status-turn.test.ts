// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type MemoryEntry,
  renderText,
  type StatusEntry,
  statusCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

let day = 0;

/** An entry of the memory, a day after the one before unless `created` says otherwise. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => {
  day += 1;
  return {
    id,
    kind: "reminder",
    status: "open",
    created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    origin: { by: "claude-code" },
    text: `Texto de ${id}`,
    ...extra,
  };
};

const CHANGE: StatusEntry = {
  id: "20261103-a",
  kind: "standard",
  phase: "implementing",
  title: "A",
  waitingFor: "agent",
  current: true,
  pendingScope: [],
};

/** `specty status`'s card, as the person reads it. */
const card = (memory: readonly MemoryEntry[], ctx: CardContext = ES) =>
  renderText(statusCard([CHANGE], ctx, memory), ctx.lang);

/** The same card before Specty had a memory. */
const plain = (ctx: CardContext = ES) => renderText(statusCard([CHANGE], ctx), ctx.lang);

/** The lines of `text` under the section `title`, up to the next section or SIGUIENTE. */
const sectionOf = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

/** The titles of the card's sections, in order. */
const titles = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => /^[A-ZÁÉÍÓÚÑ' ]+:$/.test(line))
    .map((line) => line.slice(0, -1));

describe("«TE TOCA» in status's card", () => {
  it("AC1: shows the open reminders by date, with how to mark them done", () => {
    const memory = [
      entry("P3", { text: "Recompilar el dist de main\ncon una segunda línea" }),
      entry("P1", { created: "2026-10-01T10:00:00.000Z", text: "Subir la rama de la memoria" }),
    ];
    expect(sectionOf(card(memory), "TE TOCA")).toEqual([
      "P1 · Subir la rama de la memoria",
      "P3 · Recompilar el dist de main",
      "Cuando se cumpla uno, márcalo hecho con `specty memory done <id>`.",
    ]);
    expect(sectionOf(card(memory, EN), "YOUR TURN")).toEqual([
      "P1 · Subir la rama de la memoria",
      "P3 · Recompilar el dist de main",
      "When one is fulfilled, mark it done with `specty memory done <id>`.",
    ]);
  });

  it("AC1: goes between the open changes and delegated mode, and keeps the next step", () => {
    const delegated = { ...ES, delegated: true };
    const text = card([entry("P1")], delegated);
    expect(titles(text)).toEqual(["CAMBIOS ABIERTOS", "TE TOCA", "MODO DELEGADO"]);
    const next = (rendered: string) =>
      rendered.split("\n").find((line) => line.startsWith("SIGUIENTE:"));
    expect(next(text)).toBeDefined();
    expect(next(text)).toBe(next(plain(delegated)));
  });

  it("AC1: leaves out the reminders already done or dropped", () => {
    const memory = [
      entry("P1", { status: "done", closed: { at: "2026-11-03T10:00:00.000Z", by: "person" } }),
      entry("P2", { status: "dropped", closed: { at: "2026-11-03T10:00:00.000Z", by: "person" } }),
      entry("P3", { text: "Sigue abierto" }),
    ];
    expect(sectionOf(card(memory), "TE TOCA")).toEqual([
      "P3 · Sigue abierto",
      "Cuando se cumpla uno, márcalo hecho con `specty memory done <id>`.",
    ]);
  });

  it("AC2: is the card of before with no open reminder, though other entries are open", () => {
    const memory = [
      entry("P1", { kind: "pending" }),
      entry("P2", { kind: "improvement" }),
      entry("D1", { kind: "decision", quote: "sí" }),
      entry("P3", { status: "done", closed: { at: "2026-11-03T10:00:00.000Z", by: "person" } }),
    ];
    expect(card(memory)).toBe(plain());
    expect(card(memory, EN)).toBe(plain(EN));
    expect(card([])).not.toContain("TE TOCA");
  });
});
