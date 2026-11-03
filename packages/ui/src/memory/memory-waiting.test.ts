// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "@baquia-dev/specty-core";
import type { MemoryRecord } from "../data/records";
import { memorySections } from "./memory-view";

const entry = (id: string, day: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "reminder",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

/** P1 waits for nothing; P2 for 9 November, P3 for the files of `src/`, P4 for a change. */
const RECORD: MemoryRecord = {
  entries: [
    entry("P1", 1),
    entry("P2", 2, { due: "2026-11-09" }),
    entry("P3", 3, { paths: ["src/**"] }),
    entry("P4", 4, { onClose: "20261104-x" }),
    entry("P5", 5, { kind: "pending" }),
  ],
  changes: [],
};

/** Each section's key with the ids of its items, in order, on day `today`. */
const outline = (record: MemoryRecord, today: string) =>
  memorySections(record, undefined, today).map((section) => ({
    key: section.key,
    items: section.items.map((item) => ("entry" in item ? item.entry.id : item.change.id)),
  }));

describe("the reminders that wait, on the memory page", () => {
  it("AC1: are not in «Te toca», but in their own section, by date", () => {
    expect(outline(RECORD, "2026-11-04")).toEqual([
      { key: "turn", items: ["P1"] },
      { key: "work", items: ["P5"] },
      { key: "waiting", items: ["P2", "P3", "P4"] },
    ]);
    const waiting = memorySections(RECORD, undefined, "2026-11-04").find(
      (section) => section.key === "waiting",
    );
    expect(waiting?.label).toEqual({ es: "Recordatorios que esperan", en: "Reminders that wait" });
    expect(waiting?.items.map((item) => item.kind)).toEqual(["reminder", "reminder", "reminder"]);
  });

  it("AC2: one whose day came is the person's turn again", () => {
    expect(outline(RECORD, "2026-11-09")).toEqual([
      { key: "turn", items: ["P1", "P2"] },
      { key: "work", items: ["P5"] },
      { key: "waiting", items: ["P3", "P4"] },
    ]);
  });
});
