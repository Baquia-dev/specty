// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import * as index from "../src";
import { CHANGE_SORTS, type ChangeSort, matchesQuery, sortChanges } from "../src/light";

/** A change as a list sees it: its id, title, phase start, size and epic. */
interface Listed {
  readonly id: string;
  readonly title: string;
  readonly phaseSince: string;
  readonly size?: { readonly level: "S" | "M" | "L" | "XL" };
  readonly epic?: { readonly id: string; readonly title: string; readonly slice?: string };
}

const EPIC = { id: "20261101-panel-academico", title: "Panel académico", slice: "C2" };

const CHANGES: readonly Listed[] = [
  {
    id: "20261103-evolucion-trimestre",
    title: "Evolución del trimestre",
    phaseSince: "2026-11-03T10:00:00.000Z",
    size: { level: "M" },
  },
  {
    id: "20261102-boletines-pdf",
    title: "Boletines en PDF",
    phaseSince: "2026-11-02T10:00:00.000Z",
    size: { level: "L" },
    epic: EPIC,
  },
  {
    id: "20261104-avisos",
    title: "avisos de calificaciones",
    phaseSince: "2026-11-01T10:00:00.000Z",
  },
  {
    id: "20261105-zonas",
    title: "Zonas horarias",
    phaseSince: "2026-11-04T10:00:00.000Z",
    size: { level: "L" },
  },
];

const ids = (changes: readonly Listed[]) => changes.map((change) => change.id.slice(9));

describe("the search of a list of changes", () => {
  it("AC4: finds a change by its title, its id or its epic's id, title or slice, ignoring case and accents", () => {
    const found = (query: string) => ids(CHANGES.filter((change) => matchesQuery(change, query)));
    expect(found("EVOLUCION")).toEqual(["evolucion-trimestre"]);
    expect(found("trimestre")).toEqual(["evolucion-trimestre"]);
    expect(found("20261104-avisos")).toEqual(["avisos"]);
    expect(found("panel academico")).toEqual(["boletines-pdf"]);
    expect(found("20261101-panel")).toEqual(["boletines-pdf"]);
    expect(found("c2")).toEqual(["boletines-pdf"]);
    expect(found("nada parecido")).toEqual([]);
    // No text, or only spaces, lets every change through; spaces inside count once.
    expect(found("")).toHaveLength(CHANGES.length);
    expect(found("   ")).toHaveLength(CHANGES.length);
    expect(found("  Boletines   en  ")).toEqual(["boletines-pdf"]);
  });

  it("AC4: is the same function in the light entry and in the index", () => {
    expect(index.matchesQuery).toBe(matchesQuery);
    expect(index.sortChanges).toBe(sortChanges);
    expect(index.CHANGE_SORTS).toBe(CHANGE_SORTS);
  });
});

describe("the order of a list of changes", () => {
  const sorted = (sort: ChangeSort, changes: readonly Listed[] = CHANGES) =>
    ids(sortChanges(changes, sort, "es"));

  it("AC4: sorts by what has waited longest, the most recent, the title or the size", () => {
    expect(CHANGE_SORTS).toEqual(["waiting", "recent", "title", "size"]);
    expect(sorted("waiting")).toEqual(["avisos", "boletines-pdf", "evolucion-trimestre", "zonas"]);
    expect(sorted("recent")).toEqual(["zonas", "evolucion-trimestre", "boletines-pdf", "avisos"]);
    // By title in the language given, without telling case or accents apart.
    expect(sorted("title")).toEqual(["avisos", "boletines-pdf", "evolucion-trimestre", "zonas"]);
    // The largest first and, of the same size, what has waited longest; no size goes last.
    expect(sorted("size")).toEqual(["boletines-pdf", "zonas", "evolucion-trimestre", "avisos"]);
  });

  it("AC4: breaks every tie by the id, whatever order the changes come in", () => {
    const at = "2026-11-02T10:00:00.000Z";
    const tied: readonly Listed[] = [
      { id: "20261102-c", title: "Igual", phaseSince: at, size: { level: "S" } },
      { id: "20261102-a", title: "Igual", phaseSince: at, size: { level: "S" } },
      { id: "20261102-b", title: "Igual", phaseSince: at, size: { level: "S" } },
    ];
    for (const sort of CHANGE_SORTS) {
      expect([sort, sorted(sort, tied)]).toEqual([sort, ["a", "b", "c"]]);
      expect([sort, sorted(sort, tied.toReversed())]).toEqual([sort, ["a", "b", "c"]]);
    }
  });

  it("AC4: gives a new list and leaves the one given as it was", () => {
    const given = [...CHANGES];
    const result = sortChanges(given, "recent", "es");
    expect(result).not.toBe(given);
    expect(given).toEqual(CHANGES);
  });
});
