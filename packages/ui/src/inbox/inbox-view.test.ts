// SPDX-License-Identifier: Apache-2.0
import { sampleRecords } from "../data/fixtures";
import type { ChangeView } from "../data/records";
import { deriveViews } from "../data/views";
import * as inboxViewModule from "./inbox-view";
import {
  type InboxFilters,
  type InboxSection,
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
    expect(by("decision")).toHaveLength(6);
    expect(ids(by("active")).toSorted()).toEqual(["login-google", "modo-oscuro"]);
    expect(ids(by("recent")).toSorted()).toEqual(["chat-docentes", "redondeo-promedios"]);
  });

  it("groups by state by default, what has waited longest first (AC4)", () => {
    const sections = inboxSections(CHANGES, DEFAULTS, "es");
    expect(sections.map((section) => `${section.label.es} ${section.changes.length}`)).toEqual([
      "Esperan tu decisión 6",
      "En curso 2",
      "Recientes 2",
    ]);
    expect(ids(sections[0]?.changes ?? [])).toEqual([
      "asistencia-curso",
      "recordatorios-correo",
      "justificar-faltas",
      "evolucion-trimestre",
      "avisos-calificaciones",
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
    expect(counts.get("all")).toBe(10);
    expect(counts.get("review")).toBe(2);
    expect(counts.get("testing")).toBe(1);
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
      "testing",
      "implementing",
      "acceptance",
      "closing",
      "done",
      "cancelled",
    ]);
    expect(byPhase[1]?.label.es).toBe("Revisión");
    const none = inboxSections(CHANGES, { ...DEFAULTS, group: "none" }, "es");
    expect(none.map((section) => [section.label.es, section.changes.length])).toEqual([
      ["Todos los cambios", 10],
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

  it("AC3: clusters changes of the same epic contiguously in a section and builds epic blocks", () => {
    const base = CHANGES[0] ?? fail();
    const epicRef = { id: "20261015-panel", title: "Panel académico", slice: "C1" };
    const slice1 = {
      ...base,
      id: "20261018-corte-1",
      title: "Corte 1",
      epic: epicRef,
    } as ChangeView;
    const standalone = { ...base, id: "20261019-sola", title: "Spec sola" } as ChangeView;
    const slice2 = {
      ...base,
      id: "20261020-corte-2",
      title: "Corte 2",
      epic: { ...epicRef, slice: "C2" },
    } as ChangeView;
    const sections = inboxSections([slice1, standalone, slice2], DEFAULTS, "es");
    expect(ids(sections[0]?.changes ?? [])).toEqual(["corte-1", "corte-2", "sola"]);
    const sectionBlocks = (
      inboxViewModule as {
        sectionBlocks?: (
          section: InboxSection,
        ) => readonly {
          kind: string;
          epicId?: string;
          title?: string;
          changes?: readonly ChangeView[];
        }[];
      }
    ).sectionBlocks;
    expect(sectionBlocks).toBeDefined();
    const blocks = sectionBlocks ? sectionBlocks(sections[0] ?? fail()) : [];
    expect(blocks.map((b) => [b.kind, b.epicId, b.changes?.length])).toEqual([
      ["epic", "20261015-panel", 2],
      ["row", undefined, undefined],
    ]);
    expect(matchesQuery(slice1, "Panel académico")).toBe(true);
    expect(matchesQuery(slice1, "C1")).toBe(true);
  });

  it("AC4: groups by epic into per-epic sections followed by sections per change kind", () => {
    const base = CHANGES[0] ?? fail();
    const make = (
      id: string,
      title: string,
      kind: ChangeView["kind"],
      epic?: { id: string; title: string; slice?: string },
    ) => ({ ...base, id, title, kind, ...(epic ? { epic } : {}) }) as ChangeView;
    const items = [
      make("20261019-sola", "Spec sola", "standard"),
      make("20261018-corte-1", "Corte 1", "standard", {
        id: "20261015-panel",
        title: "Panel académico",
        slice: "C1",
      }),
      make("20261021-rapida", "Cambio rápido", "quick"),
      make("20261015-panel", "Panel académico", "epic"),
      make("20261022-manual", "Ajuste manual", "retro"),
      make("20261023-spike", "Explorar caché", "spike"),
    ];
    const sections = inboxSections(
      items,
      { ...DEFAULTS, group: "epic" as InboxFilters["group"] },
      "es",
    );
    expect(sections.map((s) => [s.key, s.label.es, ids(s.changes)])).toEqual([
      ["epic:20261015-panel", "Épica · Panel académico", ["panel", "corte-1"]],
      ["standard", "Specs individuales", ["sola"]],
      ["quick", "Cambios quick", ["rapida"]],
      ["retro", "Cambios manuales", ["manual"]],
      ["spike", "Spikes", ["spike"]],
    ]);
  });
});

function fail(): never {
  throw new Error("no sample changes");
}
