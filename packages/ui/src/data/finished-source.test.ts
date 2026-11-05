// SPDX-License-Identifier: Apache-2.0
// The finished changes in pages, as each source gives them: the local server answers
// `GET /api/changes/finished`; a source that does not page works the page out in memory.
import { sampleRecords } from "./fixtures";
import { ActionError, type ChangeRecord, type ChangeView, SpectyData } from "./records";
import { ServerData } from "./server";
import type { FinishedRequest } from "./source";
import { deriveViews } from "./views";

const FIRST: FinishedRequest = {
  offset: 0,
  limit: 30,
  query: "",
  phase: "all",
  sort: "waiting",
  lang: "es",
};

const EPIC = "20261015-panel";
const HOUR = 3_600_000;
const SLICE = "20261013-archivo-de-avisos";
const CHAT = "20261014-chat-docentes";
const ROUNDING = "20261015-redondeo-promedios";

/** A finished slice and a cancelled change, as the local server summarizes them. */
const SUMMARIES = [
  {
    id: SLICE,
    title: "Archivo de avisos",
    kind: "standard",
    epic: { id: EPIC, title: "Panel académico", slice: "C1", sliceTitle: "Asistencia por curso" },
    phase: "done",
    phaseSince: "2026-10-13T10:00:00.000Z",
    createdAt: "2026-10-12T09:00:00.000Z",
    closedAt: "2026-10-13T10:00:00.000Z",
    size: { level: "M", reasons: [{ es: "6 archivos", en: "6 files" }] },
    tasks: { done: 2, total: 2 },
    tab: "history",
  },
  {
    id: CHAT,
    title: "Chat de docentes",
    kind: "standard",
    phase: "cancelled",
    phaseSince: "2026-10-14T10:00:00.000Z",
    createdAt: "2026-10-14T08:00:00.000Z",
    closedAt: "2026-10-14T10:00:00.000Z",
    size: { level: "S", reasons: [{ es: "1 archivo", en: "1 file" }] },
    tasks: { done: 0, total: 1 },
    tab: "history",
  },
];

/** A page with those two summaries, as the local server answers it. */
const PAGE = {
  changes: SUMMARIES,
  total: 2,
  counts: { done: 1, cancelled: 1 },
  finished: 2,
};

/** `fetch` answering every request with `status` and `body` as JSON. */
function answering(status: number, body: unknown) {
  const fetched = vi.fn((_url: string) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

/** Why `finished` failed, in Spanish. */
async function failure(): Promise<string> {
  const error: unknown = await new ServerData().finished(FIRST).catch((caught: unknown) => caught);
  return error instanceof ActionError ? error.text.es : "no falló con su motivo";
}

/**
 * The sample project with an open epic, «Panel académico», whose Cortes section names C1, and a
 * finished slice of it, «Archivo de avisos», an hour ago: three finished changes in all.
 */
function withSlice(): readonly ChangeRecord[] {
  const now = Date.now();
  const records = sampleRecords(now);
  const [base] = records;
  if (base === undefined) throw new Error("no sample change");
  const epic: ChangeRecord = {
    ...base,
    spec: [
      "---\nkind: epic\n---\n\n# Panel académico\n\n## Objetivo\n\nSeguimiento.\n",
      "## Cortes\n\n- C1: Asistencia por curso\n  - ac: AC1\n",
    ].join("\n"),
    state: { ...base.state, id: EPIC, kind: "epic", phase: "implementing", branch: "specty/p" },
  };
  const id = "20261013-archivo-de-avisos";
  const slice: ChangeRecord = {
    ...base,
    spec: `---\nkind: standard\nepic: ${EPIC}\nslice: C1\n---\n\n# Archivo de avisos\n\n## Objetivo\n\nX.\n`,
    state: { ...base.state, id, kind: "standard", phase: "done", branch: `specty/${id}` },
    phaseSince: new Date(now - HOUR).toISOString(),
  };
  return [...records, epic, slice];
}

/** A source that gives every change at once, as the prototype and the MCP App do. */
class Listed extends SpectyData {
  constructor(private readonly records: readonly ChangeRecord[]) {
    super();
  }

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(this.records);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** A page whose changes are, in this order, those of `ids`, for `toMatchObject`. */
const listing = (...ids: readonly string[]) => ({ changes: ids.map((id) => ({ id })) });

/** What a list shows of a change: the fields of its summary, taken from its whole view. */
function summaryOf(view: ChangeView | undefined) {
  if (view === undefined) throw new Error("no such change");
  const { id, title, kind, epic, slices, phase, phaseSince, createdAt, closedAt } = view;
  const { size, tasks, tab } = view;
  return {
    id,
    title,
    kind,
    epic,
    slices,
    phase,
    phaseSince,
    createdAt,
    closedAt,
    size,
    tasks,
    tab,
  };
}

describe("the finished changes in pages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC5: asks GET /api/changes/finished for the page, with its search, phase, sort and language", async () => {
    const fetched = answering(200, PAGE);
    const request: FinishedRequest = {
      offset: 30,
      limit: 30,
      query: "boletín pdf",
      phase: "done",
      sort: "title",
      lang: "en",
    };
    expect(await new ServerData().finished(request)).toEqual(PAGE);
    expect(fetched).toHaveBeenCalledTimes(1);
    const asked = new URL(String(fetched.mock.calls[0]?.[0]), "http://localhost");
    expect(asked.pathname).toBe("/api/changes/finished");
    expect(Object.fromEntries(asked.searchParams)).toEqual({
      offset: "30",
      limit: "30",
      q: "boletín pdf",
      phase: "done",
      sort: "title",
      lang: "en",
    });
  });

  it("AC5: explains a missing session, an error and an unexpected answer", async () => {
    answering(403, { error: "forbidden" });
    expect(await failure()).toBe(
      "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
    );
    answering(500, {});
    expect(await failure()).toBe("El servidor respondió 500.");
    answering(200, sampleRecords(Date.now()));
    expect(await failure()).toBe("El servidor devolvió datos inesperados.");
    answering(200, { records: [{ spec: "# Sin estado" }], total: 1 });
    expect(await failure()).toBe("El servidor devolvió datos inesperados.");
    answering(200, { records: [], total: 0, finished: 0, epics: {} });
    expect(await failure()).toBe("El servidor devolvió datos inesperados.");
  });

  it("AC6: a source that does not page gives its finished changes in memory, as the server does", async () => {
    const records = withSlice();
    const source = new Listed(records);
    const first = await source.finished(FIRST);
    // What waits longest first: the cancelled chat (72 h), the rounding (26 h), the slice (1 h).
    expect(first).toMatchObject({
      ...listing(CHAT, ROUNDING, SLICE),
      total: 3,
      counts: { done: 2, cancelled: 1 },
      finished: 3,
    });
    const second = await source.finished({ ...FIRST, offset: 1, limit: 1 });
    expect(second).toMatchObject({ ...listing(ROUNDING), total: 3 });
    expect(await source.finished({ ...FIRST, limit: 0 })).toMatchObject(listing());
  });

  it("AC6: finds, filters, counts and sorts the finished changes in memory, as the server does", async () => {
    const source = new Listed(withSlice());
    const found = await source.finished({ ...FIRST, query: "CHAT" });
    expect(found).toMatchObject({
      ...listing(CHAT),
      total: 1,
      counts: { done: 0, cancelled: 1 },
      finished: 3,
    });
    // The search looks at the epic's title too, without accents.
    expect(await source.finished({ ...FIRST, query: "panel academico" })).toMatchObject(
      listing(SLICE),
    );
    const done = await source.finished({ ...FIRST, phase: "done" });
    expect(done).toMatchObject({
      ...listing(ROUNDING, SLICE),
      total: 2,
      counts: { done: 2, cancelled: 1 },
    });
    // An open phase finds no finished change; the counts stay those of the search.
    const open = await source.finished({ ...FIRST, phase: "review" });
    expect(open).toMatchObject({ ...listing(), total: 0, counts: { done: 2, cancelled: 1 } });
    expect(await source.finished({ ...FIRST, sort: "recent" })).toMatchObject(
      listing(SLICE, ROUNDING, CHAT),
    );
    expect(await source.finished({ ...FIRST, sort: "title" })).toMatchObject(
      listing(SLICE, CHAT, ROUNDING),
    );
  });

  it("AC3: a source that gives every change gives each finished one by the summary the UI derives, without the epics", async () => {
    const records = withSlice();
    const views = deriveViews(records);
    const summary = (id: string) => summaryOf(views.find((view) => view.id === id));
    expect(await new Listed(records).finished(FIRST)).toEqual({
      changes: [summary(CHAT), summary(ROUNDING), summary(SLICE)],
      total: 3,
      counts: { done: 2, cancelled: 1 },
      finished: 3,
    });
    // The slice carries the titles of its epic and of its slice, from the epic it gives.
    expect(summary(SLICE).epic).toEqual({
      id: EPIC,
      title: "Panel académico",
      slice: "C1",
      sliceTitle: "Asistencia por curso",
    });
  });

  it("AC4: takes the summaries of a page as the server gives them, and explains a page of records or a summary it cannot read", async () => {
    answering(200, PAGE);
    expect(await new ServerData().finished(FIRST)).toEqual(PAGE);
    const unexpected = "El servidor devolvió datos inesperados.";
    // A page as the server gave them before: whole records and the titles of their epics.
    answering(200, {
      records: sampleRecords(Date.now()),
      total: 2,
      counts: { done: 1, cancelled: 1 },
      finished: 2,
      epics: { [EPIC]: "Panel académico" },
    });
    expect(await failure()).toBe(unexpected);
    const [slice, chat] = SUMMARIES;
    if (slice === undefined || chat === undefined) throw new Error("no summaries");
    const { title: _untitled, ...untitled } = chat;
    for (const odd of [
      untitled,
      { ...slice, epic: { id: EPIC, slice: "C1" } },
      { ...chat, tasks: { done: "0", total: 1 } },
      { ...chat, size: { level: "S" } },
    ]) {
      answering(200, { ...PAGE, changes: [slice, odd] });
      expect(await failure()).toBe(unexpected);
    }
  });
});
