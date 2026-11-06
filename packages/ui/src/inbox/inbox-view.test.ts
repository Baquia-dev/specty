// SPDX-License-Identifier: Apache-2.0
import { matchesQuery, sortChanges } from "@baquia-dev/specty-core/light";
import { sampleRecords } from "../data/fixtures";
import type { ChangeView } from "../data/records";
import { deriveViews } from "../data/views";
import {
  INBOX_SORTS,
  type InboxBlock,
  type InboxFilters,
  type InboxState,
  inboxSections,
  phaseCounts,
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
    expect(sections.map((section) => `${section.label.es} ${section.blocks.length}`)).toEqual([
      "Esperan tu decisión 6",
      "En curso 2",
      "Recientes 2",
    ]);
    expect(ids(sections[0]?.order ?? [])).toEqual([
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
    expect(none.map((section) => [section.label.es, section.blocks.length])).toEqual([
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

  it("AC5: searches and sorts with core's functions, as the server does: ties go by id", () => {
    const { epic: _epic, ...plain } = CHANGES[0] ?? fail();
    const at = "2026-11-02T10:00:00.000Z";
    const tied = ["20261102-c", "20261102-a", "20261102-b"].map(
      (id) => ({ ...plain, id, title: "Igual", kind: "standard", phaseSince: at }) as ChangeView,
    );
    for (const sort of INBOX_SORTS) {
      const [section] = inboxSections(tied, { ...DEFAULTS, group: "none", sort }, "es");
      expect([sort, ids(section?.order ?? [])]).toEqual([sort, ["a", "b", "c"]]);
    }
    expect(visibleChanges(CHANGES, { query: "EVOLUCIÓN", phase: "all" })).toEqual(
      CHANGES.filter((change) => matchesQuery(change, "evolucion")),
    );
  });

  it("AC1: shows an epic once, with all its slices, in its most urgent section, counted as one", () => {
    const { epic, waiting, working, finished, standalone, other } = epicSamples();
    const all = [finished, working, standalone, epic, other, waiting];
    const sections = inboxSections(all, DEFAULTS, "es");
    // The epic is in progress, a slice waits for a decision: the block goes to the decisions.
    expect(sections.map((s) => [s.key, s.blocks.length, ids(s.order)])).toEqual([
      ["decision", 2, ["panel", "corte-1", "corte-2", "corte-3", "sola"]],
      ["active", 1, ["otra"]],
    ]);
    expect(blockSummary(sections[0]?.blocks ?? [])).toEqual([
      ["epic", "panel", ["corte-1", "corte-2", "corte-3"]],
      ["row", "sola", []],
    ]);
    // Without a slice waiting, in progress; with only finished members, among the recent ones.
    const calm = inboxSections([epic, working, finished], DEFAULTS, "es");
    expect(calm.map((s) => [s.key, s.blocks.length, ids(s.order)])).toEqual([
      ["active", 1, ["panel", "corte-2", "corte-3"]],
    ]);
    const over = { ...epic, phase: "done" } as ChangeView;
    const past = inboxSections([finished, over], DEFAULTS, "es");
    expect(past.map((s) => [s.key, s.blocks.length, ids(s.order)])).toEqual([
      ["recent", 1, ["panel", "corte-3"]],
    ]);
  });

  it("AC1: keeps an epic without slices loaded as its block, and a slice without its epic as a row", () => {
    const { epic, waiting, standalone } = epicSamples();
    const lost = sample("20261022-suelta", "Suelta", "decision", "review", "2026-11-04T09:00:00Z", {
      epic: { id: "20261001-vieja", title: "Épica vieja", slice: "C2" },
    });
    const all = [epic, lost, standalone];
    const byState = inboxSections(all, DEFAULTS, "es");
    expect(byState.map((s) => [s.key, blockSummary(s.blocks)])).toEqual([
      [
        "decision",
        [
          ["row", "suelta", []],
          ["row", "sola", []],
        ],
      ],
      ["active", [["epic", "panel", []]]],
    ]);
    // Grouping by epic, the lone slice goes to its epic's section, with the title it brings.
    const byEpic = inboxSections([...all, waiting], { ...DEFAULTS, group: "epic" }, "es");
    expect(byEpic.map((s) => [s.key, s.label.es, blockSummary(s.blocks)])).toEqual([
      ["epic:20261015-panel", "Épica · Panel académico", [["epic", "panel", ["corte-1"]]]],
      ["epic:20261001-vieja", "Épica · Épica vieja", [["row", "suelta", []]]],
      ["standard", "Features", [["row", "sola", []]]],
    ]);
  });

  it("AC10: puts the epic once, with all its slices, in its phase, in its place or in its own section", () => {
    const { epic, waiting, working, finished, standalone, other } = epicSamples();
    const all = [finished, working, standalone, epic, other, waiting];
    const shape = (filters: Partial<InboxFilters>) =>
      inboxSections(all, { ...DEFAULTS, ...filters }, "es").map((s) => [
        s.key,
        s.blocks.length,
        ids(s.order),
      ]);
    // By phase: the epic's own phase, whatever the phases of its slices.
    expect(shape({ group: "phase" })).toEqual([
      ["testing", 1, ["otra"]],
      ["implementing", 1, ["panel", "corte-1", "corte-2", "corte-3"]],
      ["acceptance", 1, ["sola"]],
    ]);
    // Without grouping: where its first member goes in the order chosen, the open ones first.
    expect(shape({ group: "none", sort: "title" })).toEqual([
      ["all", 3, ["sola", "panel", "corte-1", "corte-2", "corte-3", "otra"]],
    ]);
    // By epic: its own section, and the other changes by kind.
    expect(shape({ group: "epic" })).toEqual([
      ["epic:20261015-panel", 1, ["panel", "corte-1", "corte-2", "corte-3"]],
      ["standard", 2, ["sola", "otra"]],
    ]);
  });

  it("AC10: lets the whole epic through when a filter lets through any one of its members", () => {
    const { epic, waiting, working, finished, standalone, other } = epicSamples();
    const all = [finished, working, standalone, epic, other, waiting];
    const shape = (filters: Partial<InboxFilters>) =>
      inboxSections(all, { ...DEFAULTS, ...filters }, "es").map((s) => [
        s.key,
        s.blocks.length,
        ids(s.order),
      ]);
    const whole = ["panel", "corte-1", "corte-2", "corte-3"];
    // Only the finished slice matches: the epic still goes, whole, with the decisions.
    expect(shape({ query: "Corte 3" })).toEqual([["decision", 1, whole]]);
    expect(shape({ phase: "done" })).toEqual([["decision", 1, whole]]);
    expect(shape({ phase: "done", group: "phase" })).toEqual([["implementing", 1, whole]]);
    expect(shape({ query: "Panel", group: "epic" })).toEqual([["epic:20261015-panel", 1, whole]]);
    // None of its members matches: the epic is not shown.
    expect(shape({ query: "Alfa" })).toEqual([["decision", 1, ["sola"]]]);
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
    expect(sections.map((s) => [s.key, s.label.es, ids(s.order)])).toEqual([
      ["epic:20261015-panel", "Épica · Panel académico", ["panel", "corte-1"]],
      ["standard", "Features", ["sola"]],
      ["quick", "Cambios quick", ["rapida"]],
      ["retro", "Cambios manuales", ["manual"]],
      ["spike", "Spikes", ["spike"]],
    ]);
    expect(sections.find((s) => s.key === "standard")?.label.en).toBe("Features");
  });
});

/** Each block: an epic with its slices, or a row. */
const blockSummary = (blocks: readonly InboxBlock[]) =>
  blocks.map((block) =>
    block.kind === "epic"
      ? ["epic", ids([block.epic])[0], ids(block.slices)]
      : ["row", ids([block.change])[0], []],
  );

/** A change like the samples in `state`, with the given id, title, phase and phase start. */
function sample(
  id: string,
  title: string,
  state: InboxState,
  phase: ChangeView["phase"],
  phaseSince: string,
  extra: Partial<ChangeView> = {},
): ChangeView {
  const { epic: _epic, ...base } = CHANGES.find((change) => stateOf(change) === state) ?? fail();
  return { ...base, id, title, kind: "standard", phase, phaseSince, ...extra } as ChangeView;
}

/**
 * An epic in progress, «Panel académico», with a slice waiting for a decision, one in progress and
 * one finished; and two changes of their own, one waiting for a decision and one in progress.
 */
function epicSamples() {
  const of = (slice: string) => ({
    epic: { id: "20261015-panel", title: "Panel académico", slice },
  });
  return {
    epic: sample(
      "20261015-panel",
      "Panel académico",
      "active",
      "implementing",
      "2026-11-01T10:00:00Z",
      {
        kind: "epic",
      },
    ),
    waiting: sample(
      "20261018-corte-1",
      "Corte 1",
      "decision",
      "review",
      "2026-11-02T10:00:00Z",
      of("C1"),
    ),
    working: sample(
      "20261019-corte-2",
      "Corte 2",
      "active",
      "testing",
      "2026-11-03T10:00:00Z",
      of("C2"),
    ),
    finished: sample(
      "20261012-corte-3",
      "Corte 3",
      "recent",
      "done",
      "2026-10-30T10:00:00Z",
      of("C3"),
    ),
    standalone: sample(
      "20261020-sola",
      "Alfa sola",
      "decision",
      "acceptance",
      "2026-11-04T10:00:00Z",
    ),
    other: sample("20261021-otra", "Zeta otra", "active", "testing", "2026-11-05T10:00:00Z"),
  };
}

function fail(): never {
  throw new Error("no sample changes");
}
