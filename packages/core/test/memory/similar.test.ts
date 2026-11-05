// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type MemoryEntry, similarEntries } from "../../src";

const AT = "2026-11-06T12:00:00.000Z";

/** An open pending item of Specty's memory, created on day `day` of November. */
const entry = (id: string, day: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const FLAKY = "El test de la página embebida falla a veces con un error del worker";
const ALIKE = "Falla a veces el test embebido por un error no capturado del worker";

const ids = (found: readonly MemoryEntry[]) => found.map((known) => known.id);

describe("the open entries a new one looks like", () => {
  it("AC1: open, taken or proposed to drop pending items and improvements whose text is alike, by date", () => {
    const entries = [
      entry("P4", 4, { text: FLAKY, status: "drop-proposed" }),
      entry("P2", 2, { text: FLAKY, kind: "improvement" }),
      entry("P3", 3, { text: FLAKY, status: "taken", taken: { change: "20261106-x", at: AT } }),
      entry("P1", 1, { text: "Traducir la guía de instalación al inglés" }),
    ];
    expect(
      ids(similarEntries(entries, { kind: "pending", text: ALIKE, distinctFrom: [] })),
    ).toEqual(["P2", "P3", "P4"]);
    expect(
      ids(similarEntries(entries, { kind: "improvement", text: ALIKE, distinctFrom: [] })),
    ).toEqual(["P2", "P3", "P4"]);
  });

  it("AC1: compares the whole text, not only its first line", () => {
    const entries = [entry("P1", 1, { text: `Revisar el informe.\n${FLAKY}` })];
    expect(
      ids(similarEntries(entries, { kind: "pending", text: ALIKE, distinctFrom: [] })),
    ).toEqual(["P1"]);
  });

  it("AC2: leaves out those of distinctFrom, written as entry ids are", () => {
    const entries = [entry("P7", 1, { text: FLAKY }), entry("P8", 2, { text: FLAKY })];
    const found = (distinctFrom: readonly string[]) =>
      ids(similarEntries(entries, { kind: "pending", text: ALIKE, distinctFrom }));
    expect(found(["P7"])).toEqual(["P8"]);
    expect(found(["p07", " P8 "])).toEqual([]);
    expect(found(["P99"])).toEqual(["P7", "P8"]);
  });

  it("AC3: none done or dropped, no reminder, decision or lesson, and none unlike it", () => {
    const closed = { at: AT, by: "person" };
    const entries = [
      entry("P1", 1, { text: FLAKY, status: "done", closed }),
      entry("P2", 2, {
        text: FLAKY,
        status: "dropped",
        closed,
        drop: { reason: "Repetido", by: "person", at: AT },
      }),
      entry("P3", 3, { text: FLAKY, kind: "reminder" }),
      entry("D1", 4, { text: FLAKY, kind: "decision", quote: "sí" }),
      entry("P4", 5, { text: FLAKY, kind: "lesson", paths: ["packages/ui/**"] }),
      entry("P5", 6, { text: "Traducir la guía de instalación al inglés" }),
    ];
    expect(similarEntries(entries, { kind: "pending", text: ALIKE, distinctFrom: [] })).toEqual([]);
  });

  it("AC4: none for a new reminder, decision or lesson", () => {
    const entries = [entry("P1", 1, { text: FLAKY })];
    for (const kind of ["reminder", "decision", "lesson"] as const)
      expect(similarEntries(entries, { kind, text: ALIKE, distinctFrom: [] }), kind).toEqual([]);
  });
});
