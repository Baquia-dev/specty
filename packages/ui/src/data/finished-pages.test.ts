// SPDX-License-Identifier: Apache-2.0
// The pages of finished changes in the store: apart from the open changes, one page after another,
// each change once, and read again from the first when the source says something changed.
import { TestBed } from "@angular/core/testing";
import { ChangesStore, DERIVER } from "./changes-store";
import type { FinishedQuery } from "./finished-pages";
import { sampleRecords } from "./fixtures";
import { type ChangeRecord, SpectyData } from "./records";
import type { FinishedPage, FinishedRequest } from "./source";
import { deriveViews } from "./views";

const QUERY: FinishedQuery = { query: "", phase: "all", sort: "waiting", lang: "es" };
const START = Date.parse("2026-10-01T08:00:00.000Z");

const SAMPLES = sampleRecords(Date.now());
const isFinished = (record: ChangeRecord) =>
  record.state.phase === "done" || record.state.phase === "cancelled";
/** The open changes of the sample project. */
const OPEN = SAMPLES.filter((record) => !isFinished(record));
const BASE = SAMPLES.find(isFinished) ?? fail();

/** The finished change number `n`: every tenth one cancelled, each one minute after the last. */
function archived(n: number): ChangeRecord {
  const nn = String(n).padStart(2, "0");
  const id = `20261001-archivado-${nn}`;
  return {
    ...BASE,
    spec: `---\nkind: standard\n---\n\n# Archivado ${nn}\n\n## Objetivo\n\nUn cambio terminado.\n`,
    state: {
      ...BASE.state,
      id,
      kind: "standard",
      phase: n % 10 === 0 ? "cancelled" : "done",
      branch: `specty/${id}`,
    },
    phaseSince: new Date(START + n * 60_000).toISOString(),
  };
}

/** Seventy finished changes, the first one waiting longest. */
const ARCHIVED = Array.from({ length: 70 }, (_, index) => archived(index + 1));

/**
 * A source that gives every change in `changes`, as `/api/changes` does before C6, and pages the
 * finished ones as any source does by default. It can hold its answers to give them in any order.
 */
class Archive extends SpectyData {
  open: readonly ChangeRecord[] = OPEN;
  archived: readonly ChangeRecord[] = ARCHIVED;
  readonly asked: FinishedRequest[] = [];
  holding = false;
  private readonly held: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([...this.open, ...this.archived]);
  }

  override async finished(request: FinishedRequest): Promise<FinishedPage> {
    this.asked.push(request);
    if (this.holding) await new Promise<void>((go) => this.held.push(go));
    return super.finished(request);
  }

  /** Answers the held request number `index`, counting from the first held. */
  release(index: number): void {
    this.held[index]?.();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Says something changed, as the local server's events do. */
  tell(): void {
    for (const listener of this.listeners) listener();
  }
}

function setup(source: SpectyData = new Archive()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useValue: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  return TestBed.inject(ChangesStore);
}

/** Lets the store load and the source answer. */
async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

const numbers = (views: readonly { readonly id: string }[]) =>
  views.map((view) => view.id.replace(/^\d+-archivado-/, ""));
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => String(from + index).padStart(2, "0"));

describe("the pages of finished changes in the store", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: keeps the open changes apart and takes the finished ones only from the pages", async () => {
    const source = new Archive();
    const store = setup(source);
    await settle();
    expect(store.open().map((view) => view.id)).toEqual(OPEN.map((record) => record.state.id));
    expect(store.finished()).toEqual([]);
    await store.pages.ask(QUERY);
    await settle();
    expect(source.asked).toEqual([{ ...QUERY, offset: 0, limit: 30 }]);
    expect(numbers(store.finished())).toEqual(range(1, 30));
    expect([store.pages.total(), store.pages.finished(), store.pages.counts()]).toEqual([
      70,
      70,
      { done: 63, cancelled: 7 },
    ]);
    expect(store.pages.complete()).toBe(false);
    // Every change loaded, once: those `changes` gives and those of the pages.
    const all = store.all().map((view) => view.id);
    expect([all.length, new Set(all).size]).toEqual([78, 78]);
    // The same query again, as when going back to the Inbox, keeps the pages.
    await store.pages.ask({ ...QUERY });
    await settle();
    expect(source.asked).toHaveLength(1);
    expect(store.finished()).toHaveLength(30);
  });

  it("AC2: asks each page from where the last one ended, without repeating a change, until none are left", async () => {
    const source = new Archive();
    const store = setup(source);
    await store.pages.ask(QUERY);
    await settle();
    // A change archived meanwhile, first in the order: the 30th moves to the second page.
    source.archived = [archived(0), ...ARCHIVED];
    await store.pages.more();
    await settle();
    expect(numbers(store.finished())).toEqual(range(1, 59));
    await store.pages.more();
    await settle();
    expect(numbers(store.finished())).toEqual(range(1, 70));
    expect(source.asked.map((request) => [request.offset, request.limit])).toEqual([
      [0, 30],
      [30, 30],
      [60, 30],
    ]);
    expect(store.pages.complete()).toBe(true);
    await store.pages.more();
    await settle();
    expect(source.asked).toHaveLength(3);
  });

  it("AC3: a new search, phase or sort asks from the first page and leaves the pages before", async () => {
    const source = new Archive();
    const store = setup(source);
    await store.pages.ask(QUERY);
    await settle();
    await store.pages.more();
    await settle();
    expect(store.finished()).toHaveLength(60);
    // Two queries in a row: the answer to the first one arrives last and is left out.
    source.holding = true;
    void store.pages.ask({ ...QUERY, query: "archivado 1" });
    void store.pages.ask({ ...QUERY, phase: "cancelled" });
    await settle();
    source.release(1);
    await settle();
    source.release(0);
    await settle();
    expect(source.asked.slice(2)).toEqual([
      { ...QUERY, query: "archivado 1", offset: 0, limit: 30 },
      { ...QUERY, phase: "cancelled", offset: 0, limit: 30 },
    ]);
    expect(numbers(store.finished())).toEqual(["10", "20", "30", "40", "50", "60", "70"]);
    expect([store.pages.total(), store.pages.complete()]).toEqual([7, true]);
    source.holding = false;
    await store.pages.ask({ ...QUERY, phase: "cancelled", sort: "recent" });
    await settle();
    expect(source.asked.at(-1)).toEqual({
      ...QUERY,
      phase: "cancelled",
      sort: "recent",
      offset: 0,
      limit: 30,
    });
    expect(numbers(store.finished())).toEqual(["70", "60", "50", "40", "30", "20", "10"]);
  });

  it("AC4: when the source says something changed, reads again as many finished as were loaded, from the first", async () => {
    const source = new Archive();
    const store = setup(source);
    await store.pages.ask(QUERY);
    await settle();
    await store.pages.more();
    await settle();
    source.archived = [archived(0), ...ARCHIVED];
    // An open change moves on meanwhile: the evolution chart, from its review to implementing.
    const [first, ...rest] = OPEN;
    if (first === undefined) fail();
    source.open = [{ ...first, state: { ...first.state, phase: "implementing" } }, ...rest];
    source.tell();
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...QUERY, offset: 0, limit: 60 });
    expect(numbers(store.finished())).toEqual(range(0, 59));
    // The open changes are read again too.
    expect(store.open().find((view) => view.id === first.state.id)?.phase).toBe("implementing");
    await store.pages.more();
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...QUERY, offset: 60, limit: 30 });
    const ids = store.finished().map((view) => view.id);
    expect([ids.length, new Set(ids).size]).toEqual([71, 71]);
  });

  it("AC1: a finished slice takes the title of its epic from the epic loaded, or else from the page", async () => {
    const epic = "20261015-panel";
    const gone = "20260901-epica-archivada";
    const [base] = OPEN;
    if (base === undefined) fail();
    const made = (
      id: string,
      spec: string,
      kind: "epic" | "standard",
      phase: "implementing" | "done",
    ) => ({
      ...base,
      spec,
      state: { ...base.state, id, kind, phase, branch: `specty/${id}` },
    });
    const epicRecord = made(
      epic,
      "---\nkind: epic\n---\n\n# Panel académico\n\n## Objetivo\n\nSeguimiento.\n\n## Cortes\n\n- C1: Asistencia por curso\n  - ac: AC1\n",
      "epic",
      "implementing",
    );
    const slice = (id: string, of: string, cut: string) =>
      made(
        id,
        `---\nkind: standard\nepic: ${of}\nslice: ${cut}\n---\n\n# Corte ${cut}\n`,
        "standard",
        "done",
      );
    const page: FinishedPage = {
      records: [slice("20261016-corte-uno", epic, "C1"), slice("20261002-corte-dos", gone, "C2")],
      total: 2,
      counts: { done: 2, cancelled: 0 },
      finished: 2,
      epics: { [epic]: "Un título más viejo", [gone]: "Épica archivada" },
    };
    class Crafted extends SpectyData {
      changes(): Promise<readonly ChangeRecord[]> {
        return Promise.resolve([epicRecord]);
      }

      override finished(): Promise<FinishedPage> {
        return Promise.resolve(page);
      }

      subscribe(): () => void {
        return () => undefined;
      }
    }
    const store = setup(new Crafted());
    await settle();
    await store.pages.ask(QUERY);
    await settle();
    expect(store.finished().map((view) => view.epic)).toEqual([
      { id: epic, title: "Panel académico", slice: "C1", sliceTitle: "Asistencia por curso" },
      { id: gone, title: "Épica archivada", slice: "C2" },
    ]);
  });
});

function fail(): never {
  throw new Error("missing sample change");
}
