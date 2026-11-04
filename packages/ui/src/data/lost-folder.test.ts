// SPDX-License-Identifier: Apache-2.0
// A change without its folder in the UI's data: its mark in the view, and bringing the folder
// back through the local server.
import { sampleRecords } from "./fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { ServerData } from "./server";
import { deriveViews } from "./views";

const CHANGE = "20261024-saludo";

/** A source with no data of its own: what any source does unless it says otherwise. */
class Bare extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** A sample change, as the server sends it once its folder is lost. */
function lostRecord(): ChangeRecord {
  const [sample] = sampleRecords(Date.now());
  if (sample === undefined) throw new Error("no sample change");
  const { folder: _, ...rest } = sample;
  return { ...rest, lost: true };
}

/** A local server inside `fetch`, answering by path, that keeps every request. */
function serverAnswering(answers: Readonly<Record<string, readonly [number, unknown]>>) {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      const [status, body] = answers[url] ?? [404, { error: "not found" }];
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
  return requests;
}

describe("a change without its folder in the UI's data", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC3: is marked lost in its view, and other changes are not", () => {
    const lost = lostRecord();
    const [view] = deriveViews([lost]);
    expect(view?.lost).toBe(true);
    expect(view?.folder).toBeUndefined();
    const [other] = deriveViews(sampleRecords(Date.now()).slice(0, 1));
    expect(other?.lost).toBeUndefined();
  });

  it("AC5: is brought back through the local server, with the CSRF token", async () => {
    const requests = serverAnswering({
      "/api/session": [200, { actions: true, csrf: "t0k3n" }],
      [`/api/changes/${CHANGE}/restore`]: [200, { status: "ok" }],
    });
    await new ServerData().restoreFolder(CHANGE);
    const sent = requests.find(({ url }) => url.endsWith("/restore"));
    expect(sent?.init?.method).toBe("POST");
    expect(new Headers(sent?.init?.headers).get("X-Specty-CSRF")).toBe("t0k3n");
  });

  it("AC5: says why the server could not bring it back", async () => {
    serverAnswering({
      "/api/session": [200, { actions: true, csrf: "t0k3n" }],
      [`/api/changes/${CHANGE}/restore`]: [
        409,
        {
          status: "blocked",
          header: `SPECTY · ${CHANGE}`,
          blocks: [{ lines: ["En /repo/.worktrees/x hay una carpeta que git no reconoce."] }],
          next: "pídele a la persona que la aparte.",
        },
      ],
    });
    const error: unknown = await new ServerData()
      .restoreFolder(CHANGE)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ActionError);
    expect(error instanceof ActionError ? error.text.es : "").toContain(
      "hay una carpeta que git no reconoce",
    );
  });

  it("AC5: is not brought back by a read-only source, which says why", async () => {
    const error: unknown = await new Bare()
      .restoreFolder(CHANGE)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ActionError);
    const readOnly = await new Bare().readOnly();
    expect(error instanceof ActionError ? error.text : undefined).toEqual(readOnly);
  });
});
