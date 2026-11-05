// SPDX-License-Identifier: Apache-2.0
// The finished changes in pages, as each source gives them: the local server answers
// `GET /api/changes/finished`; a source that does not page works the page out in memory.
import { sampleRecords } from "./fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { ServerData } from "./server";
import type { FinishedPage, FinishedRequest } from "./source";

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

const short = (page: FinishedPage) => page.records.map((record) => record.state.id);

describe("the finished changes in pages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC5: asks GET /api/changes/finished for the page, with its search, phase, sort and language", async () => {
    const records = sampleRecords(Date.now()).filter(
      (record) => record.state.phase === "done" || record.state.phase === "cancelled",
    );
    const page: FinishedPage = {
      records,
      total: 2,
      counts: { done: 1, cancelled: 1 },
      finished: 2,
      epics: { [EPIC]: "Panel académico" },
    };
    const fetched = answering(200, page);
    const request: FinishedRequest = {
      offset: 30,
      limit: 30,
      query: "boletín pdf",
      phase: "done",
      sort: "title",
      lang: "en",
    };
    expect(await new ServerData().finished(request)).toEqual(page);
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
    expect(short(first)).toEqual([
      "20261014-chat-docentes",
      "20261015-redondeo-promedios",
      "20261013-archivo-de-avisos",
    ]);
    expect(first.records).toEqual(
      first.records.map((record) => records.find((given) => given.state.id === record.state.id)),
    );
    expect([first.total, first.counts, first.finished]).toEqual([3, { done: 2, cancelled: 1 }, 3]);
    // The title of the epic of each slice in the page, from the epic it gives.
    expect(first.epics).toEqual({ [EPIC]: "Panel académico" });

    const second = await source.finished({ ...FIRST, offset: 1, limit: 1 });
    expect([short(second), second.total, second.epics]).toEqual([
      ["20261015-redondeo-promedios"],
      3,
      {},
    ]);
    expect((await source.finished({ ...FIRST, limit: 0 })).records).toEqual([]);
  });

  it("AC6: finds, filters, counts and sorts the finished changes in memory, as the server does", async () => {
    const source = new Listed(withSlice());
    const found = await source.finished({ ...FIRST, query: "CHAT" });
    expect([short(found), found.total, found.counts, found.finished]).toEqual([
      ["20261014-chat-docentes"],
      1,
      { done: 0, cancelled: 1 },
      3,
    ]);
    // The search looks at the epic's title too, without accents.
    expect(short(await source.finished({ ...FIRST, query: "panel academico" }))).toEqual([
      "20261013-archivo-de-avisos",
    ]);
    const done = await source.finished({ ...FIRST, phase: "done" });
    expect([short(done), done.total, done.counts]).toEqual([
      ["20261015-redondeo-promedios", "20261013-archivo-de-avisos"],
      2,
      { done: 2, cancelled: 1 },
    ]);
    // An open phase finds no finished change; the counts stay those of the search.
    const open = await source.finished({ ...FIRST, phase: "review" });
    expect([short(open), open.total, open.counts]).toEqual([[], 0, { done: 2, cancelled: 1 }]);
    expect(short(await source.finished({ ...FIRST, sort: "recent" }))).toEqual([
      "20261013-archivo-de-avisos",
      "20261015-redondeo-promedios",
      "20261014-chat-docentes",
    ]);
    expect(short(await source.finished({ ...FIRST, sort: "title" }))).toEqual([
      "20261013-archivo-de-avisos",
      "20261014-chat-docentes",
      "20261015-redondeo-promedios",
    ]);
  });
});
