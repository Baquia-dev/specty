// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { ActionError } from "../data/records";
import { ServerData } from "../data/server";
import { memorySections } from "./memory-view";

const EPIC = "20261101-panel-academico";
const FEATURE = "20261102-exportar-notas";
const C1 = "20261103-horario";
const C2 = "20261104-notas-por-curso";
const LOST = "20261020-perdido";
/** A change of origin the source says nothing of. */
const UNKNOWN = "20261025-sin-origen";

const CLOSED = { at: "2026-11-10T10:00:00.000Z", by: "person" };

const entry = (
  id: string,
  day: number,
  change?: string,
  extra: Partial<MemoryEntry> = {},
): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: change === undefined ? { by: "claude-code" } : { change, by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

/** What the server says of each change of origin: the epic, a feature, its two slices, one gone. */
const ORIGINS = {
  [EPIC]: { title: "Panel académico", kind: "epic", phase: "implementing" },
  [FEATURE]: { title: "Exportar notas", kind: "standard", phase: "implementing" },
  [C1]: {
    title: "Horario",
    kind: "standard",
    phase: "done",
    epic: { id: EPIC, title: "Panel académico", slice: "C1" },
  },
  [C2]: {
    title: "Notas por curso",
    kind: "standard",
    phase: "review",
    epic: { id: EPIC, title: "Panel académico", slice: "C2" },
  },
  [LOST]: { title: LOST },
} as const;

const ENTRIES: readonly MemoryEntry[] = [
  entry("P1", 1),
  entry("P2", 2, FEATURE),
  entry("P3", 3, C2),
  entry("P4", 4, C1),
  entry("P5", 5, FEATURE, { kind: "improvement" }),
  entry("P6", 6, LOST),
  entry("P7", 2, EPIC, { kind: "improvement" }),
  entry("D1", 7, FEATURE, { kind: "decision", quote: "sí" }),
  entry("P9", 8, undefined, { status: "done", closed: CLOSED }),
  entry("P10", 9, UNKNOWN),
];

const RECORD = { entries: ENTRIES, changes: [], origins: ORIGINS };

/** The ids of the entries of «Pendientes y mejoras» that `query` keeps, in order. */
const work = (query: string) =>
  memorySections(RECORD, { query, kind: "all", closed: false })
    .find((section) => section.key === "work")
    ?.items.map((item) => ("entry" in item ? item.entry.id : item.change.id));

describe("the groups of «Pendientes y mejoras»", () => {
  it("AC3: orders the groups by their newest entry, the slices inside their epic too, with «Sin feature» last", () => {
    const section = memorySections(RECORD).find((found) => found.key === "work");
    expect(section).toMatchObject({
      groups: [
        {
          change: { id: UNKNOWN, title: UNKNOWN },
          items: [{ entry: { id: "P10" } }],
          features: [],
        },
        { change: { id: LOST, title: LOST }, items: [{ entry: { id: "P6" } }], features: [] },
        {
          change: { id: FEATURE, title: "Exportar notas", kind: "standard", phase: "implementing" },
          items: [{ entry: { id: "P2" } }, { entry: { id: "P5" } }],
          features: [],
        },
        {
          change: { id: EPIC, title: "Panel académico", kind: "epic", phase: "implementing" },
          items: [{ entry: { id: "P7" } }],
          features: [
            {
              change: { id: C1, title: "Horario", epic: { id: EPIC, slice: "C1" } },
              items: [{ entry: { id: "P4" } }],
              features: [],
            },
            {
              change: { id: C2, title: "Notas por curso", epic: { id: EPIC, slice: "C2" } },
              items: [{ entry: { id: "P3" } }],
              features: [],
            },
          ],
        },
        { items: [{ entry: { id: "P1" } }], features: [] },
      ],
    });
    expect(section).toMatchObject({
      groups: [{}, {}, {}, {}, expect.not.objectContaining({ change: expect.anything() })],
    });
    // The section's own list keeps every entry, in the order of its groups.
    expect(work("")).toEqual(["P10", "P6", "P2", "P5", "P7", "P4", "P3", "P1"]);
  });

  it("AC3: groups the entries of a change the source says nothing of under its id", () => {
    const bare = { entries: [entry("P2", 2, FEATURE), entry("P1", 1)], changes: [] };
    expect(memorySections(bare).find((found) => found.key === "work")).toMatchObject({
      groups: [
        { change: { id: FEATURE, title: FEATURE }, items: [{ entry: { id: "P2" } }] },
        { items: [{ entry: { id: "P1" } }] },
      ],
    });
  });

  it("AC4: finds the pending items of a feature by its title, and those of every slice by their epic's", () => {
    expect(work("notas por")).toEqual(["P3"]);
    expect(work("EXPORTAR")).toEqual(["P2", "P5"]);
    expect(work("panel academico")).toEqual(["P7", "P4", "P3"]);
    expect(work("horario")).toEqual(["P4"]);
  });
});

describe("the memory the local server gives", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** `fetch` answering every request with 200 and `body` as JSON. */
  const answering = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))),
    );

  it("AC1: reads the changes of origin, and refuses one without a title", async () => {
    const answer = { entries: [entry("P2", 2, FEATURE)], changes: [], origins: ORIGINS };
    answering(answer);
    expect(await new ServerData().memory()).toEqual(answer);
    answering({ ...answer, origins: { [FEATURE]: { kind: "standard", phase: "done" } } });
    const error: unknown = await new ServerData().memory().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ActionError);
    answering({ ...answer, origins: [] });
    const listed: unknown = await new ServerData().memory().catch((caught: unknown) => caught);
    expect(listed).toBeInstanceOf(ActionError);
  });
});
