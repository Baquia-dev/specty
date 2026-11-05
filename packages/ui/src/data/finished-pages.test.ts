// SPDX-License-Identifier: Apache-2.0
// The pages of finished changes in the store: apart from the open changes, one page after another,
// each change once, and read again from the first when the source says something changed.
import { TestBed } from "@angular/core/testing";
import { ChangesStore, DERIVER, type Deriver } from "./changes-store";
import type { FinishedQuery } from "./finished-pages";
import { sampleRecords } from "./fixtures";
import { type ChangeRecord, SpectyData } from "./records";
import { ServerData } from "./server";
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
 * A source that gives every change in `changes`, as the prototype and the MCP App do, and pages
 * the finished ones as any source does by default. It can hold its answers to give them in any
 * order.
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

const derived: Deriver = (records) => Promise.resolve(deriveViews(records));

function setup(source: SpectyData = new Archive(), derive: Deriver = derived) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useValue: source },
      { provide: DERIVER, useValue: derive },
    ],
  });
  return TestBed.inject(ChangesStore);
}

/**
 * As the local server: `open` in the list, and the page of finished changes that `fetch` answers
 * to `ServerData`, as JSON.
 */
class Paged extends SpectyData {
  constructor(private readonly open: readonly ChangeRecord[]) {
    super();
  }

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(this.open);
  }

  override finished(request: FinishedRequest): Promise<FinishedPage> {
    return new ServerData().finished(request);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** `fetch` answering every request with `body` as JSON. */
function answering(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))),
  );
}

/** The summary of a finished change `id`, as the server gives it, with `epic` if it has one. */
function summary(id: string, title: string, epic?: Readonly<Record<string, string>>) {
  return {
    id,
    title,
    kind: "standard",
    ...(epic === undefined ? {} : { epic }),
    phase: "done",
    phaseSince: "2026-10-16T10:00:00.000Z",
    createdAt: "2026-10-16T08:00:00.000Z",
    closedAt: "2026-10-16T10:00:00.000Z",
    size: { level: "S", reasons: [{ es: "2 archivos", en: "2 files" }] },
    tasks: { done: 1, total: 1 },
    tab: "history",
  };
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
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

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

  it("AC4: a finished slice takes the title of its epic from the epic loaded, or else from the page", async () => {
    const epic = "20261015-panel";
    const gone = "20260901-epica-archivada";
    const [base] = OPEN;
    if (base === undefined) fail();
    const epicRecord: ChangeRecord = {
      ...base,
      spec: "---\nkind: epic\n---\n\n# Panel académico\n\n## Objetivo\n\nSeguimiento.\n\n## Cortes\n\n- C1: Asistencia por curso\n  - ac: AC1\n",
      state: { ...base.state, id: epic, kind: "epic", phase: "implementing", branch: "specty/p" },
    };
    answering({
      changes: [
        summary("20261016-corte-uno", "Corte C1", {
          id: epic,
          title: "Un título más viejo",
          slice: "C1",
        }),
        summary("20261002-corte-dos", "Corte C2", {
          id: gone,
          title: "Épica archivada",
          slice: "C2",
        }),
      ],
      total: 2,
      counts: { done: 2, cancelled: 0 },
      finished: 2,
    });
    const store = setup(new Paged([epicRecord]));
    await settle();
    await store.pages.ask(QUERY);
    await settle();
    expect(store.finished().map((view) => view.epic)).toEqual([
      { id: epic, title: "Panel académico", slice: "C1", sliceTitle: "Asistencia por curso" },
      { id: gone, title: "Épica archivada", slice: "C2" },
    ]);
  });

  it("AC4: keeps each summary of a page as the server gives it, without deriving it", async () => {
    const summaries = [
      summary("20261016-boletin-pdf", "Boletín en PDF", {
        id: "20261001-boletines",
        title: "Boletines",
        slice: "C1",
        sliceTitle: "Un PDF por alumno",
      }),
      summary("20261017-avisos", "Avisos de faltas"),
    ];
    answering({ changes: summaries, total: 2, counts: { done: 2, cancelled: 0 }, finished: 2 });
    const asked: string[] = [];
    const store = setup(new Paged(OPEN), (records) => {
      asked.push(...records.map((record) => record.state.id));
      return derived(records);
    });
    await settle();
    await store.pages.ask(QUERY);
    await settle();
    expect(store.finished()).toEqual(summaries);
    expect([store.pages.total(), store.pages.finished(), store.pages.complete()]).toEqual([
      2,
      2,
      true,
    ]);
    // Only the open changes the list gives are derived; the pages' summaries, never.
    expect(new Set(asked)).toEqual(new Set(OPEN.map((record) => record.state.id)));
  });
});

function fail(): never {
  throw new Error("missing sample change");
}
