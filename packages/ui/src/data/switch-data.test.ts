// SPDX-License-Identifier: Apache-2.0
// Specty's switch as each data source gives it: the local server's, the prototype's and a source
// that knows nothing of it.
import { TestBed } from "@angular/core/testing";
import { FixtureData, REVIEWER } from "./fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { ServerData } from "./server";

const SESSION: [number, unknown] = [200, { actions: true, csrf: "t0k3n" }];

/** A local server inside `fetch`: it answers by path, as JSON, and keeps every request. */
function serverAnswering(answers: Readonly<Record<string, readonly [number, unknown]>>) {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
  const fetched = vi.fn((url: string, init?: RequestInit) => {
    requests.push({ url, ...(init === undefined ? {} : { init }) });
    const [status, body] = answers[url] ?? [404, { error: "not found" }];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  vi.stubGlobal("fetch", fetched);
  return requests;
}

/** A source that only gives changes: it knows nothing of the switch. */
class Plain extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

describe("Specty's switch in the data sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("AC6: ServerData reads /api/switch, refuses an unexpected answer and posts { on } with the token", async () => {
    const view = {
      on: false,
      by: "Ana",
      at: "2026-11-08T10:00:00Z",
      log: [
        { on: false, by: "Ana", at: "2026-11-08T10:00:00Z" },
        { on: true, by: "Luis", at: "2026-11-07T09:00:00Z" },
      ],
    };
    const requests = serverAnswering({ "/api/switch": [200, view] });
    const data = new ServerData();
    expect(await data.specty()).toEqual(view);
    expect(requests.map(({ url }) => url)).toEqual(["/api/switch"]);
    const wrong = [
      { on: false },
      { on: "no", log: [] },
      { on: true, by: 3, log: [] },
      { on: true, log: [{ on: true }] },
      { on: true, log: [{ on: true, by: "Ana", at: 7 }] },
    ];
    for (const body of wrong) {
      serverAnswering({ "/api/switch": [200, body] });
      await expect(data.specty()).rejects.toThrow("The server returned unexpected data.");
    }
    serverAnswering({ "/api/switch": [403, { error: "forbidden" }] });
    await expect(data.specty()).rejects.toBeInstanceOf(ActionError);

    const posted = serverAnswering({ "/api/session": SESSION, "/api/switch": [200, view] });
    await data.setSpecty(false);
    expect(posted.map(({ url, init }) => [url, init?.method ?? "GET", init?.body ?? ""])).toEqual([
      ["/api/session", "GET", ""],
      ["/api/switch", "POST", '{"on":false}'],
    ]);
    expect(new Headers(posted[1]?.init?.headers).get("X-Specty-CSRF")).toBe("t0k3n");

    serverAnswering({ "/api/session": [200, { actions: false }] });
    await expect(new ServerData().setSpecty(true)).rejects.toThrow("read only");
  });

  it("AC6: FixtureData starts on with a sample log, adds each change and tells the subscribers", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
    const fixtures = TestBed.inject(SpectyData);
    const heard = vi.fn();
    fixtures.subscribe(heard);
    const start = await fixtures.specty();
    expect(start?.on).toBe(true);
    expect(start?.log.length).toBeGreaterThan(0);
    expect(start?.log[0]?.on).toBe(true);

    await fixtures.setSpecty(false);
    const off = await fixtures.specty();
    expect(off).toMatchObject({ on: false, by: REVIEWER, at: expect.any(String) });
    expect(off?.log).toHaveLength((start?.log.length ?? 0) + 1);
    expect(off?.log[0]).toEqual({ on: false, by: REVIEWER, at: off?.at });

    await fixtures.setSpecty(true);
    const on = await fixtures.specty();
    expect(on?.on).toBe(true);
    expect(on?.log[0]?.on).toBe(true);
    expect(heard).toHaveBeenCalledTimes(2);
    // The state it already has adds nothing.
    await fixtures.setSpecty(true);
    expect((await fixtures.specty())?.log).toHaveLength(on?.log.length ?? 0);
  });

  it("AC6: a source that does not know the switch gives nothing and refuses to change it", async () => {
    const plain = new Plain();
    expect(await plain.specty()).toBeUndefined();
    await expect(plain.setSpecty(false)).rejects.toThrow("read only");
  });
});
