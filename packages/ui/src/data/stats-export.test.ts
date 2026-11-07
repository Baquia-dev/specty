// SPDX-License-Identifier: Apache-2.0
// The panel's export, as each source gives it: the local server answers `GET /api/stats/export`
// with the file as it is; a source that does not export the panel gives none.
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { ServerData } from "./server";
import { answered, NO_SESSION } from "./server-answers";
import type { StatsExportParams } from "./stats-export";

const ASKED: StatsExportParams = {
  period: "7d",
  who: "person:Ana",
  kind: "quick",
  format: "csv",
  lang: "en",
};

/** A CSV as the server writes it: with the BOM that tells a spreadsheet it is UTF-8. */
const BYTES = new TextEncoder().encode(
  "\uFEFFChange,Title\r\n20261105-panel-de-cambios,Panel con acentos: áéí\r\n",
);

/** A source that only gives its changes, as the prototype's does. */
class Bare extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

/** `fetch` answering every request with `status`, `body` and `headers`. */
function answering(
  status: number,
  body: string | Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = {},
) {
  const fetched = vi.fn((_url: string) => Promise.resolve(new Response(body, { status, headers })));
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

/** The URL `fetch` was asked for, the first time. */
function askedUrl(fetched: ReturnType<typeof answering>): URL {
  return new URL(String(fetched.mock.calls[0]?.[0]), "http://127.0.0.1");
}

/** Why `statsExport` failed, in Spanish. */
async function failure(): Promise<string> {
  const error: unknown = await new ServerData()
    .statsExport(ASKED)
    .catch((caught: unknown) => caught);
  return error instanceof ActionError ? error.text.es : "no falló con su motivo";
}

describe("the panel's export from each source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC4: asks the local server for the file of the cut, its format and its language, and gives its bytes, its type and its name", async () => {
    const fetched = answering(200, BYTES, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="specty-stats-2026-11-01-2026-11-07.csv"',
    });
    const file = await new ServerData().statsExport(ASKED);
    expect(file).toEqual({
      name: "specty-stats-2026-11-01-2026-11-07.csv",
      type: "text/csv; charset=utf-8",
      content: BYTES,
    });
    // The bytes as they came: the BOM is still there.
    const content = file?.content;
    expect(content instanceof Uint8Array ? [...content.subarray(0, 3)] : []).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
    const url = askedUrl(fetched);
    expect(url.pathname).toBe("/api/stats/export");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      period: "7d",
      who: "person:Ana",
      kind: "quick",
      format: "csv",
      lang: "en",
    });
  });

  it("AC4: leaves out of the request the parts of the cut it does not have, and names the file by its format when the server does not", async () => {
    const fetched = answering(200, '{"changes":[]}\n', {
      "content-type": "application/json; charset=utf-8",
    });
    const file = await new ServerData().statsExport({ format: "json", lang: "es" });
    expect(file?.name).toBe("specty-stats.json");
    expect(file?.type).toBe("application/json; charset=utf-8");
    expect(Object.fromEntries(askedUrl(fetched).searchParams)).toEqual({
      format: "json",
      lang: "es",
    });
  });

  it("AC5: says why when the tab has no session or the server fails", async () => {
    answering(403, '{"error":"forbidden"}');
    expect(await failure()).toBe(NO_SESSION.es);
    answering(500, "boom");
    expect(await failure()).toBe(answered(500).es);
  });

  it("AC5: a source that does not export the panel gives nothing", async () => {
    expect(await new Bare().statsExport(ASKED)).toBeUndefined();
  });
});
