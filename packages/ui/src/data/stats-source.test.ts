// SPDX-License-Identifier: Apache-2.0
// The panel and its table of changes, as each source gives them: the local server answers
// `GET /api/stats` and `GET /api/stats/changes`; a source that does not give them gives none.
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { ServerData } from "./server";
import { NO_SESSION, UNEXPECTED } from "./server-answers";
import type { StatsChangesParams, StatsParams } from "./source";

const ASKED: StatsChangesParams = {
  period: "7d",
  who: "person:Ana",
  kind: "quick",
  q: "panel",
  sort: "title",
  dir: "asc",
  offset: 25,
  limit: 25,
  lang: "es",
};

/** A page of the table, as the local server answers it. */
const PAGE = {
  query: { period: "7d", who: { kind: "person", name: "Ana" }, kind: "quick" },
  range: { from: "2026-11-01", to: "2026-11-07" },
  table: { q: "panel", sort: "title", dir: "asc", offset: 25, limit: 25, lang: "es" },
  changes: [
    {
      id: "20261105-panel-de-cambios",
      title: "Panel de cambios",
      kind: "quick",
      size: "M",
      agent: "claude-code",
      closed: "2026-11-05T10:00:00.000Z",
      tasks: 3,
      cycle: 3_600_000,
      failed: 1,
      cost: 1.5,
    },
    { id: "20261106-panel-abierto", title: "Panel abierto", kind: "quick", tasks: 0, failed: 0 },
  ],
  total: 27,
};

/** A source that only gives its changes, as the prototype's does. */
class Bare extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

/** `fetch` answering every request with `status` and `body` as JSON. */
function answering(status: number, body: unknown) {
  const fetched = vi.fn((_url: string) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

/** The URL `fetch` was asked for, the `index`-th time. */
function askedUrl(fetched: ReturnType<typeof answering>, index = 0): URL {
  return new URL(String(fetched.mock.calls[index]?.[0]), "http://127.0.0.1");
}

/** Why `statsChanges` failed, in Spanish. */
async function failure(): Promise<string> {
  const error: unknown = await new ServerData()
    .statsChanges(ASKED)
    .catch((caught: unknown) => caught);
  return error instanceof ActionError ? error.text.es : "no falló con su motivo";
}

describe("the panel's table of changes from each source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC6: asks the local server for the page of the cut, the search, the order and the page, and gives its answer", async () => {
    const fetched = answering(200, PAGE);
    expect(await new ServerData().statsChanges(ASKED)).toEqual(PAGE);
    const url = askedUrl(fetched);
    expect(url.pathname).toBe("/api/stats/changes");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      period: "7d",
      who: "person:Ana",
      kind: "quick",
      q: "panel",
      sort: "title",
      dir: "asc",
      offset: "25",
      limit: "25",
      lang: "es",
    });
  });

  it("AC6: leaves out of the request the parts of the cut it does not have", async () => {
    const fetched = answering(200, { ...PAGE, query: { period: "30d" } });
    await new ServerData().statsChanges({
      q: "",
      sort: "closed",
      dir: "desc",
      offset: 0,
      limit: 25,
      lang: "en",
    });
    const params = askedUrl(fetched).searchParams;
    for (const missing of ["period", "who", "kind"]) expect(params.has(missing)).toBe(false);
    expect(params.get("lang")).toBe("en");
    expect(params.get("q")).toBe("");
  });

  it("AC6: says why when the tab has no session or the answer is not a page of the table", async () => {
    answering(403, { error: "forbidden" });
    expect(await failure()).toBe(NO_SESSION.es);
    answering(200, { ...PAGE, changes: "ninguno" });
    expect(await failure()).toBe(UNEXPECTED.es);
    answering(200, { ...PAGE, total: "27" });
    expect(await failure()).toBe(UNEXPECTED.es);
    answering(200, { ...PAGE, changes: [{ id: "20261105-sin-titulo", tasks: 1 }] });
    expect(await failure()).toBe(UNEXPECTED.es);
  });

  it("AC6: a source that does not page the panel gives no table", async () => {
    expect(await new Bare().statsChanges(ASKED)).toBeUndefined();
  });
});

/** The panel of a cut, as the local server answers it: the six figures, each with its value. */
const VIEW = {
  query: { period: "7d", who: { kind: "person", name: "Ana" }, kind: "quick" },
  range: { from: "2026-11-01", to: "2026-11-07" },
  changes: 3,
  options: [{ who: { kind: "person", name: "Ana" }, changes: 3 }],
  summary: {
    closed: { value: 2, previous: 1, delta: 1 },
    tasks: { value: 9, previous: null, delta: null },
    cycle: { value: 3_600_000, previous: null, delta: null },
    verifications: { value: 0.9, previous: null, delta: null, count: 10 },
    cost: { value: null, previous: null, delta: null, measured: 0, of: 3 },
    pending: { value: 4, previous: 4, delta: 0 },
  },
};

/** Why `stats` failed, in Spanish. */
async function statsFailure(): Promise<string> {
  const error: unknown = await new ServerData()
    .stats({ period: "7d" })
    .catch((caught: unknown) => caught);
  return error instanceof ActionError ? error.text.es : "no falló con su motivo";
}

describe("the panel of a cut from each source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC1: asks the local server for the cut with only the parameters the page has, and gives its answer", async () => {
    const fetched = answering(200, VIEW);
    const cut: StatsParams = { period: "7d", who: "person:Ana", kind: "quick" };
    expect(await new ServerData().stats(cut)).toEqual(VIEW);
    const url = askedUrl(fetched);
    expect(url.pathname).toBe("/api/stats");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      period: "7d",
      who: "person:Ana",
      kind: "quick",
    });
    await new ServerData().stats({ who: "agent:codex" });
    expect(Object.fromEntries(askedUrl(fetched, 1).searchParams)).toEqual({ who: "agent:codex" });
  });

  it("AC1: asks without a query when the page has no part of the cut", async () => {
    const fetched = answering(200, VIEW);
    await new ServerData().stats({});
    expect(String(fetched.mock.calls[0]?.[0])).toBe("/api/stats");
  });

  it("AC1: says why when the tab has no session or the answer is not a panel", async () => {
    answering(403, { error: "forbidden" });
    expect(await statsFailure()).toBe(NO_SESSION.es);
    answering(500, { error: "boom" });
    expect(await statsFailure()).toBe(UNEXPECTED.es);
    answering(200, { ...VIEW, changes: "3" });
    expect(await statsFailure()).toBe(UNEXPECTED.es);
    answering(200, { ...VIEW, options: "nadie" });
    expect(await statsFailure()).toBe(UNEXPECTED.es);
    answering(200, { ...VIEW, range: undefined });
    expect(await statsFailure()).toBe(UNEXPECTED.es);
    answering(200, { ...VIEW, summary: { ...VIEW.summary, pending: { value: "4" } } });
    expect(await statsFailure()).toBe(UNEXPECTED.es);
    answering(200, { ...VIEW, summary: { ...VIEW.summary, cost: undefined } });
    expect(await statsFailure()).toBe(UNEXPECTED.es);
  });

  it("AC1: a source that does not give the panel gives none", async () => {
    expect(await new Bare().stats({ period: "7d" })).toBeUndefined();
  });
});
