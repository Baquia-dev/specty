// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  assignable,
  assignToFront,
  type Front,
  findFront,
  isFrontName,
  type MemoryEntry,
  parseFront,
  serializeFront,
} from "../../src";

/** A front of the memory, unless `extra` says otherwise. */
const front = (name: string, extra: Partial<Front> = {}): Front => ({
  name,
  created: "2026-11-04T10:00:00.000Z",
  origin: { by: "claude-code" },
  items: [],
  text: `Lo que abarca ${name}.`,
  ...extra,
});

/** A pending item of the memory, unless `extra` says otherwise. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

describe("a front of the memory", () => {
  it("AC1: keeps its name, origin, paths, items and text in its file", () => {
    const guard = front("B", {
      origin: { change: "20261104-x", by: "claude-code" },
      paths: ["packages/cli/src/enforce/**", "packages/cli/src/install/**"],
      items: ["P12", "P3"],
      text: "Guard, instalación y empaquetado.\n\nSin la UI.",
    });
    expect(parseFront(serializeFront(guard))).toEqual(guard);
    const empty = front("ui");
    expect(parseFront(serializeFront(empty))).toEqual(empty);
    expect(serializeFront(empty)).toContain("items: []\n");
    expect(parseFront(serializeFront(front("frente B")))).toBe(undefined);
    expect(parseFront(serializeFront(front("C", { text: "  " })))).toBe(undefined);
    expect(parseFront("sin frontmatter")).toBe(undefined);
  });

  it("AC3: a name is letters without accents, digits, - or _, up to 40", () => {
    for (const name of ["B", "guard-e-instalacion", "ui_2", "9", "a".repeat(40)])
      expect(isFrontName(name)).toBe(true);
    for (const name of ["", "-b", "_b", "frente B", "camión", "a/b", "a".repeat(41)])
      expect(isFrontName(name)).toBe(false);
  });

  it("AC2: is found by its name without telling capitals apart", () => {
    const fronts = [front("Guard"), front("ui")];
    expect(findFront(fronts, "guard")).toBe(fronts[0]);
    expect(findFront(fronts, "UI")).toBe(fronts[1]);
    expect(findFront(fronts, "server")).toBe(undefined);
  });
});

describe("assigning entries to a front", () => {
  it("AC2: puts them at its end in the order given and takes them out of the others", () => {
    const fronts = [
      front("A", { items: ["P1", "P2", "P3"] }),
      front("B", { items: ["P4", "P6"] }),
      front("C", { items: ["P5"] }),
    ];
    const { fronts: changed, moved } = assignToFront(fronts, "b", ["P3", "P4", "P1", "P7"]);
    expect(changed).toEqual([
      front("B", { items: ["P6", "P3", "P4", "P1", "P7"] }),
      front("A", { items: ["P2"] }),
    ]);
    expect(moved).toEqual([{ front: "A", ids: ["P3", "P1"] }]);
  });

  it("AC2: takes pending items and improvements still open, written as their ids, once each", () => {
    const entries = [
      entry("P1"),
      entry("P2", { kind: "improvement" }),
      entry("P3", { status: "taken", taken: { change: "20261104-x", at: "2026-11-04T10:00:00Z" } }),
    ];
    expect(assignable(["p2", "P1", "P02", "P3"], entries)).toEqual({ ids: ["P2", "P1", "P3"] });
  });

  it("AC3: refuses an unknown entry, one that is not work, and one done or dropped", () => {
    const closed = { at: "2026-11-04T10:00:00.000Z", by: "person" };
    const reminder = entry("P2", { kind: "reminder" });
    const done = entry("P3", { status: "done", closed });
    const dropped = entry("P4", { status: "dropped", closed });
    const entries = [entry("P1"), reminder, done, dropped];
    expect(assignable(["P1", "P9"], entries)).toEqual({ problem: { reason: "unknown", id: "P9" } });
    expect(assignable(["P2"], entries)).toEqual({
      problem: { reason: "not-work", entry: reminder },
    });
    expect(assignable(["P3"], entries)).toEqual({ problem: { reason: "closed", entry: done } });
    expect(assignable(["P4"], entries)).toEqual({ problem: { reason: "closed", entry: dropped } });
    expect(assignable(["D1"], [entry("D1", { kind: "decision", quote: "sí" })])).toEqual({
      problem: { reason: "not-work", entry: entry("D1", { kind: "decision", quote: "sí" }) },
    });
  });
});
