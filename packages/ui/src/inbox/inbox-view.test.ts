// SPDX-License-Identifier: Apache-2.0
import { sampleRecords } from "../data/fixtures";
import { deriveViews } from "../data/views";
import {
  type InboxFilters,
  inboxSections,
  matchesQuery,
  phaseCounts,
  sortChanges,
  stateOf,
  visibleChanges,
} from "./inbox-view";

const CHANGES = deriveViews(sampleRecords(Date.now()));
const DEFAULTS: InboxFilters = { query: "", phase: "all", group: "state", sort: "waiting" };

const ids = (changes: readonly { readonly id: string }[]) =>
  changes.map((change) => change.id.replace(/^\d+-/, ""));

describe("inbox view", () => {
  it("tells what waits for the person, what is in progress and what finished", () => {
    const by = (state: string) => CHANGES.filter((change) => stateOf(change) === state);
    expect(by("decision")).toHaveLength(5);
    expect(ids(by("active")).toSorted()).toEqual(["login-google", "modo-oscuro"]);
    expect(ids(by("recent")).toSorted()).toEqual(["chat-docentes", "redondeo-promedios"]);
  });

  it("groups by state by default, what has waited longest first (AC4)", () => {
    const sections = inboxSections(CHANGES, DEFAULTS, "es");
    expect(sections.map((section) => `${section.label.es} ${section.changes.length}`)).toEqual([
      "Esperan tu decisión 5",
      "En curso 2",
      "Recientes 2",
    ]);
    expect(ids(sections[0]?.changes ?? [])).toEqual([
      "asistencia-curso",
      "recordatorios-correo",
      "justificar-faltas",
      "evolucion-trimestre",
      "boletines-pdf",
    ]);
  });

  it("finds by title or id, ignoring case and accents (AC2)", () => {
    const found = (query: string) => ids(visibleChanges(CHANGES, { query, phase: "all" }));
    expect(found("EVOLUCION")).toEqual(["evolucion-trimestre"]);
    expect(found("académica")).toEqual(["evolucion-trimestre"]);
    expect(found("boletines-pdf")).toEqual(["boletines-pdf"]);
    expect(found("   ")).toHaveLength(CHANGES.length);
    expect(found("nada parecido")).toEqual([]);
    expect(matchesQuery(CHANGES[0] ?? fail(), "")).toBe(true);
  });

  it("filters by phase, and counts each phase within the search (AC3)", () => {
    expect(ids(visibleChanges(CHANGES, { query: "", phase: "review" })).toSorted()).toEqual([
      "evolucion-trimestre",
      "justificar-faltas",
    ]);
    const counts = phaseCounts(CHANGES, "");
    expect(counts.get("all")).toBe(9);
    expect(counts.get("review")).toBe(2);
    expect(counts.get("implementing")).toBe(2);
    expect(counts.get("adjusting")).toBe(0);
    expect(phaseCounts(CHANGES, "correo").get("closing")).toBe(1);
    expect(phaseCounts(CHANGES, "correo").get("all")).toBe(1);
  });

  it("groups by phase in the order of the flow, or not at all (AC4)", () => {
    const byPhase = inboxSections(CHANGES, { ...DEFAULTS, group: "phase" }, "es");
    expect(byPhase.map((section) => section.key)).toEqual([
      "draft",
      "review",
      "implementing",
      "acceptance",
      "closing",
      "done",
      "cancelled",
    ]);
    expect(byPhase[1]?.label.es).toBe("Revisión");
    const none = inboxSections(CHANGES, { ...DEFAULTS, group: "none" }, "es");
    expect(none.map((section) => [section.label.es, section.changes.length])).toEqual([
      ["Todos los cambios", 9],
    ]);
    expect(inboxSections(CHANGES, { ...DEFAULTS, query: "nada parecido" }, "es")).toEqual([]);
  });

  it("sorts by most recent, by title or by size (AC4)", () => {
    const recent = ids(sortChanges(CHANGES, "recent", "es"));
    expect(recent.slice(0, 2)).toEqual(["boletines-pdf", "modo-oscuro"]);
    expect(recent.at(-1)).toBe("chat-docentes");
    const titles = sortChanges(CHANGES, "title", "es").map((change) => change.title);
    expect(titles).toEqual(titles.toSorted((a, b) => a.localeCompare(b, "es")));
    const order = { S: 1, M: 2, L: 3, XL: 4 } as const;
    const sizes = sortChanges(CHANGES, "size", "es").map((change) =>
      change.size ? order[change.size.level] : 0,
    );
    expect(sizes).toEqual(sizes.toSorted((a, b) => b - a));
  });
});

function fail(): never {
  throw new Error("no sample changes");
}
