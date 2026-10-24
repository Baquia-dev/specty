// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "./changes-store";
import { FixtureData, sampleRecords } from "./fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { dataSource, ServerData } from "./server";
import { deriveViews } from "./views";

/** jsdom has no EventSource: this one is driven by the test. */
class FakeEvents {
  static last: FakeEvents | undefined;
  readonly listeners = new Map<string, () => void>();
  closed = false;

  constructor(readonly url: string) {
    FakeEvents.last = this;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
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

/** Why `changes()` failed, in Spanish. */
async function failure(): Promise<string> {
  const error: unknown = await new ServerData().changes().catch((caught: unknown) => caught);
  if (!(error instanceof ActionError)) throw new Error("changes() did not fail with its reason");
  return error.text.es;
}

describe("ServerData", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the changes of the local server (AC1)", async () => {
    const records = sampleRecords(Date.now());
    const fetched = answering(200, records);
    expect(await new ServerData().changes()).toEqual(records);
    expect(fetched).toHaveBeenCalledWith("/api/changes");
  });

  it("explains a missing session, an error and unexpected data (AC2)", async () => {
    answering(403, { error: "forbidden" });
    expect(await failure()).toBe(
      "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
    );
    answering(500, {});
    expect(await failure()).toBe("El servidor respondió 500.");
    answering(200, [{ spec: "# Sin estado" }]);
    expect(await failure()).toBe("El servidor devolvió datos inesperados.");
    answering(200, { changes: [] });
    expect(await failure()).toBe("El servidor devolvió datos inesperados.");
  });

  it("reads again on each `changes` event, until it stops (AC1)", () => {
    vi.stubGlobal("EventSource", FakeEvents);
    const heard = vi.fn();
    const stop = new ServerData().subscribe(heard);
    expect(FakeEvents.last?.url).toBe("/api/events");
    FakeEvents.last?.listeners.get("changes")?.();
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    expect(FakeEvents.last?.closed).toBe(true);
  });

  it("is the source only of the page the local server serves (AC1)", async () => {
    const page = document.implementation.createHTMLDocument("Specty");
    expect(await dataSource(page)).toBe(FixtureData);
    const mark = page.createElement("meta");
    mark.name = "specty-data";
    mark.content = "server";
    page.head.append(mark);
    expect(await dataSource(page)).toBe(ServerData);
  });
});

const CHANGE = "20261024-saludo";
const at = (verb: string) => `/api/changes/${CHANGE}/${verb}`;
const SESSION: [number, unknown] = [200, { actions: true, csrf: "t0k3n" }];

/** A local server inside `fetch`: it answers by path and keeps every request. */
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

/** Why an action failed, in Spanish. */
async function reason(action: Promise<unknown>): Promise<string> {
  const error: unknown = await action.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof ActionError)) throw new Error("the action did not fail with its reason");
  return error.text.es;
}

describe("ServerData actions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends each decision to the server with the CSRF token (AC1)", async () => {
    const requests = serverAnswering({
      "/api/session": SESSION,
      ...Object.fromEntries(
        ["approve", "assumptions/A1", "scope/S1", "accept", "adjust", "close"].map((verb) => [
          at(verb),
          [200, { status: "ok" }] as const,
        ]),
      ),
    });
    const data = new ServerData();
    await data.approve(CHANGE, 2);
    await data.decideAssumption(CHANGE, "A1", "rejected", "Por trimestres.");
    await data.decideScope(CHANGE, "S1", "approved");
    await data.decideResult(CHANGE, { kind: "accept" });
    await data.decideResult(CHANGE, { kind: "adjust", request: "Más corto." });
    await data.confirmClosing(CHANGE);
    expect(requests.map(({ url, init }) => [url, init?.method ?? "GET", init?.body ?? ""])).toEqual(
      [
        ["/api/session", "GET", ""],
        [at("approve"), "POST", '{"revision":2}'],
        [at("assumptions/A1"), "POST", '{"decision":"rejected","comment":"Por trimestres."}'],
        [at("scope/S1"), "POST", '{"decision":"approved"}'],
        [at("accept"), "POST", "{}"],
        [at("adjust"), "POST", '{"request":"Más corto."}'],
        [at("close"), "POST", "{}"],
      ],
    );
    expect(new Headers(requests[1]?.init?.headers).get("X-Specty-CSRF")).toBe("t0k3n");
  });

  it("explains every refusal in the person's language (AC2)", async () => {
    const approve = () => new ServerData().approve(CHANGE, 2);
    const refused = {
      status: "blocked",
      blocks: [{ lines: ["La revisión vigente es la 1, no la 2."] }],
      next: "vuelve a cargarla antes de aprobar.",
    };
    serverAnswering({ "/api/session": SESSION, [at("approve")]: [409, refused] });
    expect(await reason(approve())).toBe(
      "La revisión vigente es la 1, no la 2. Vuelve a cargarla antes de aprobar.",
    );
    const readOnly = serverAnswering({ "/api/session": [200, { actions: false }] });
    expect(await reason(approve())).toContain("Este servidor es de solo lectura");
    expect(readOnly.map(({ url }) => url)).toEqual(["/api/session"]);
    serverAnswering({ "/api/session": SESSION, [at("approve")]: [403, { error: "read-only" }] });
    expect(await reason(approve())).toContain("lo arrancó el agente");
    serverAnswering({ "/api/session": [403, { error: "forbidden" }] });
    expect(await reason(approve())).toContain("Esta pestaña no tiene sesión");
    serverAnswering({ "/api/session": SESSION, [at("approve")]: [400, { error: "bad request" }] });
    expect(await reason(approve())).toBe("El servidor no entendió la petición.");
    serverAnswering({ "/api/session": SESSION, [at("approve")]: [500, {}] });
    expect(await reason(approve())).toBe("El servidor respondió 500.");
    const data = new ServerData();
    for (const action of [
      data.addComment(),
      data.requestChanges(),
      data.verifyChange(),
      data.diff(),
    ]) {
      expect(await reason(action)).toContain("aún no admite esto desde la UI");
    }
  });
});

describe("the inbox on the local server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("asks a tab without a session to open the link of `specty ui` (AC2)", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "es");
    answering(403, { error: "forbidden" });
    vi.stubGlobal("EventSource", FakeEvents);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        { provide: SpectyData, useClass: ServerData },
        {
          provide: DERIVER,
          useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
        },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    await TestBed.inject(Router).navigateByUrl("/");
    for (let round = 0; round < 20; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const alert = (fixture.nativeElement as HTMLElement).querySelector("[role=alert]");
    expect(alert?.textContent).toContain(
      "No se pudieron leer los cambios: Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
    );
  });
});
