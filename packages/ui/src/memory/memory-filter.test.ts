// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import type { MemoryRecord } from "../data/records";
import { type MemoryFilter, memorySections } from "./memory-view";

const CLOSED = { at: "2026-11-03T10:00:00.000Z", by: "person" };

const entry = (id: string, day: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const change = (id: string, title: string, extra: Partial<StatusEntry> = {}): StatusEntry => ({
  id,
  kind: "standard",
  phase: "implementing",
  title,
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  ...extra,
});

const RECORD: MemoryRecord = {
  entries: [
    entry("P1", 1, { text: "Exportar notas a CSV" }),
    entry("P2", 2, { kind: "improvement", text: "Caché del árbol de archivos" }),
    entry("P3", 3, { kind: "reminder", text: "Recompilar el dist" }),
    entry("D1", 1, { kind: "decision", quote: "sí", text: "Rama propia para la memoria" }),
    entry("P5", 5, { status: "done", closed: CLOSED, text: "Hecho ya" }),
    entry("P6", 6, {
      kind: "improvement",
      status: "dropped",
      closed: CLOSED,
      text: "No hace falta",
    }),
  ],
  changes: [
    change("20261103-a", "Saludo personalizado", { holder: { tool: "claude-code", ago: 2 } }),
    change("20261103-b", "Informe CSV para secretaría", {
      phase: "acceptance",
      waitingFor: "human",
    }),
  ],
};

const ALL: MemoryFilter = { query: "", kind: "all", closed: false };

/** Each section's key with the ids of its items, in order. */
const outline = (filter: Partial<MemoryFilter>) =>
  memorySections(RECORD, { ...ALL, ...filter }).map((section) => ({
    key: section.key,
    items: section.items.map((item) => ("entry" in item ? item.entry.id : item.change.id)),
  }));

describe("the filter of the memory page", () => {
  it("AC1: keeps only the entries and changes that contain the search, without accents or case", () => {
    expect(outline({ query: "csv" })).toEqual([
      { key: "turn", items: ["20261103-b"] },
      { key: "holders", items: ["20261103-b"] },
      { key: "work", items: ["P1"] },
    ]);
    expect(outline({ query: "ARBOL" })).toEqual([{ key: "work", items: ["P2"] }]);
    expect(outline({ query: "d1" })).toEqual([{ key: "decisions", items: ["D1"] }]);
    expect(outline({ query: "20261103-a" })).toEqual([{ key: "holders", items: ["20261103-a"] }]);
  });

  it("AC2: keeps only the entries of a kind, without the changes", () => {
    expect(outline({ kind: "reminder" })).toEqual([{ key: "turn", items: ["P3"] }]);
    expect(outline({ kind: "decision" })).toEqual([{ key: "decisions", items: ["D1"] }]);
    expect(outline({ kind: "pending" })).toEqual([{ key: "work", items: ["P1"] }]);
  });

  it("AC3: adds the done and dropped entries at the end, filtered too", () => {
    const sections = memorySections(RECORD, { ...ALL, closed: true });
    expect(sections.at(-1)?.key).toBe("closed");
    expect(sections.at(-1)?.label).toEqual({ es: "Hechas y descartadas", en: "Done and dropped" });
    expect(sections.at(-1)?.items.map((item) => item.kind)).toEqual(["closed", "closed"]);
    expect(outline({ closed: true, query: "hecho" })).toEqual([{ key: "closed", items: ["P5"] }]);
    expect(outline({ closed: true, kind: "improvement" })).toEqual([
      { key: "work", items: ["P2"] },
      { key: "closed", items: ["P6"] },
    ]);
  });

  it("AC3: is the same as before without a filter", () => {
    expect(memorySections(RECORD, ALL)).toEqual(memorySections(RECORD));
  });
});
