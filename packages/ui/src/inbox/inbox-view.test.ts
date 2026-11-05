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

  it("AC1: heads the group of an epic in its section with the epic, its slices below, in j/k order", () => {
    const { epic, slice1, standalone, slice2 } = epicSamples();
    const all = [slice1, standalone, epic, slice2];
    const [section] = inboxSections(all, DEFAULTS, "es");
    // j/k walk the section's changes: the epic first, then each of its slices.
    expect(ids(section?.changes ?? [])).toEqual(["panel", "corte-1", "corte-2", "sola"]);
    expect(blockSummary(blocksOf(section ?? fail(), all))).toEqual([
      ["epic", "20261015-panel", "Panel académico", "20261015-panel", ["corte-1", "corte-2"]],
      ["row", undefined, undefined, undefined, []],
    ]);
    // Grouped by epic, each epic's section is headed by the epic too.
    const [byEpic] = inboxSections(all, { ...DEFAULTS, group: "epic" }, "es");
    expect(ids(byEpic?.changes ?? [])).toEqual(["panel", "corte-1", "corte-2"]);
    expect(blockSummary(blocksOf(byEpic ?? fail(), all))).toEqual([
      ["epic", "20261015-panel", "Panel académico", "20261015-panel", ["corte-1", "corte-2"]],
    ]);
    expect(matchesQuery(slice1, "Panel académico")).toBe(true);
    expect(matchesQuery(slice1, "C1")).toBe(true);
  });

  it("AC2: heads the slices of an epic outside the section with the epic as loaded, or its title", () => {
    const { epic, slice1, standalone, slice2 } = epicSamples();
    // In progress, it waits for nothing: no decision.
    const { decision: _waits, ...rest } = epic;
    const working: ChangeView = { ...rest, phase: "implementing" };
    const all = [slice1, standalone, working, slice2];
    const sections = inboxSections(all, DEFAULTS, "es");
    const waiting = sections.find((section) => section.key === "decision") ?? fail();
    expect(ids(waiting.changes)).toEqual(["corte-1", "corte-2", "sola"]);
    const [group] = blocksOf(waiting, all);
    expect(blockSummary([group ?? fail()])).toEqual([
      ["epic", "20261015-panel", "Panel académico", undefined, ["corte-1", "corte-2"]],
    ]);
    // The header without a row takes the epic's phase and tab from the epic loaded elsewhere.
    expect([group?.epic?.id, group?.epic?.phase]).toEqual(["20261015-panel", "implementing"]);
    // In its own section, without slices there, the epic is a plain row.
    const active = sections.find((section) => section.key === "active") ?? fail();
    expect(blockSummary(blocksOf(active, all))).toEqual([
      ["row", undefined, undefined, undefined, []],
    ]);
    // Not loaded at all: the title each slice brings, and no epic.
    const [lone] = blocksOf(waiting, [slice1, standalone, slice2]);
    expect([lone?.kind, lone?.title, lone?.epic]).toEqual(["epic", "Panel académico", undefined]);
  });

  it("AC4, AC5: groups by epic into per-epic sections, then «Features» and the other kinds", () => {
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
      ["standard", "Features", ["sola"]],
      ["quick", "Cambios quick", ["rapida"]],
      ["retro", "Cambios manuales", ["manual"]],
      ["spike", "Spikes", ["spike"]],
    ]);
    expect(sections.find((s) => s.key === "standard")?.label.en).toBe("Features");
  });
});

/** What the epic blocks bring: an epic, the epic that heads it in the section, and its slices. */
interface EpicBlockForTest {
  readonly kind: string;
  readonly epicId?: string;
  readonly title?: string;
  readonly head?: ChangeView;
  readonly epic?: ChangeView;
  readonly slices?: readonly ChangeView[];
}

/** `sectionBlocks` with every change, so a header can take the epic from another section. */
const blocksOf = inboxViewModule.sectionBlocks as unknown as (
  section: InboxSection,
  all: readonly ChangeView[],
) => readonly EpicBlockForTest[];

const blockSummary = (blocks: readonly EpicBlockForTest[]) =>
  blocks.map((block) => [
    block.kind,
    block.epicId,
    block.title,
    block.head?.id,
    ids(block.slices ?? []),
  ]);

/** An epic waiting for its review, two of its slices and a standalone change. */
function epicSamples() {
  const base = CHANGES[0] ?? fail();
  const epicRef = { id: "20261015-panel", title: "Panel académico", slice: "C1" };
  return {
    epic: { ...base, id: "20261015-panel", title: "Panel académico", kind: "epic" } as ChangeView,
    slice1: { ...base, id: "20261018-corte-1", title: "Corte 1", epic: epicRef } as ChangeView,
    standalone: { ...base, id: "20261019-sola", title: "Spec sola" } as ChangeView,
    slice2: {
      ...base,
      id: "20261020-corte-2",
      title: "Corte 2",
      epic: { ...epicRef, slice: "C2" },
    } as ChangeView,
  };
}

function fail(): never {
  throw new Error("no sample changes");
}
