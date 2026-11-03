// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import type { MemoryRecord } from "../data/records";
import { memorySections } from "./memory-view";

const entry = (id: string, day: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const change = (id: string, extra: Partial<StatusEntry> = {}): StatusEntry => ({
  id,
  kind: "standard",
  phase: "implementing",
  title: id,
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  ...extra,
});

const CLOSED = { at: "2026-11-03T10:00:00.000Z", by: "person" };

/** Each section's key with the ids of its items, in order. */
const outline = (record: MemoryRecord) =>
  memorySections(record).map((section) => ({
    key: section.key,
    items: section.items.map((item) => ("entry" in item ? item.entry.id : item.change.id)),
  }));

describe("the sections of the memory page", () => {
  it("AC2: puts what waits for the person first, then who holds each change", () => {
    const record: MemoryRecord = {
      entries: [
        entry("P4", 4, { kind: "reminder" }),
        entry("P3", 3, {
          status: "drop-proposed",
          drop: { reason: "Duplica P1.", by: "claude-code", at: CLOSED.at },
        }),
        entry("P6", 6, { kind: "reminder", status: "done", closed: CLOSED }),
      ],
      changes: [
        change("20261103-a", { holder: { tool: "claude-code", ago: 2 } }),
        change("20261103-b", { phase: "acceptance", waitingFor: "human", orphan: true }),
      ],
    };
    expect(outline(record)).toEqual([
      { key: "turn", items: ["P3", "20261103-b", "P4"] },
      { key: "holders", items: ["20261103-a", "20261103-b"] },
    ]);
    const [turn] = memorySections(record);
    expect(turn?.items.map((item) => item.kind)).toEqual(["proposal", "waiting", "reminder"]);
    expect(turn?.label).toEqual({ es: "Te toca", en: "Your turn" });
  });

  it("AC3: lists the open pending items and improvements by date, then the decisions", () => {
    const record: MemoryRecord = {
      entries: [
        entry("P2", 2, {
          kind: "improvement",
          status: "taken",
          taken: { change: "20261103-a", at: CLOSED.at },
        }),
        entry("P1", 1),
        entry("D1", 1, { kind: "decision", quote: "sí" }),
        entry("P5", 5, { status: "done", closed: CLOSED }),
        entry("P7", 7, { status: "dropped", closed: CLOSED }),
        entry("P3", 3, {
          status: "drop-proposed",
          drop: { reason: "x", by: "codex", at: CLOSED.at },
        }),
      ],
      changes: [],
    };
    expect(outline(record)).toEqual([
      { key: "turn", items: ["P3"] },
      { key: "work", items: ["P1", "P2"] },
      { key: "decisions", items: ["D1"] },
    ]);
    expect(memorySections(record).map((section) => section.label.es)).toEqual([
      "Te toca",
      "Pendientes y mejoras",
      "Decisiones",
    ]);
  });

  it("AC3: has no sections for an empty memory with no open change", () => {
    expect(memorySections({ entries: [], changes: [] })).toEqual([]);
    expect(
      memorySections({
        entries: [entry("P1", 1, { status: "done", closed: CLOSED })],
        changes: [],
      }),
    ).toEqual([]);
  });
});
