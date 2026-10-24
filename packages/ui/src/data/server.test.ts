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

  it("shares one event stream between its subscribers (AC3)", () => {
    vi.stubGlobal("EventSource", FakeEvents);
    const data = new ServerData();
    const [inbox, delegation] = [vi.fn(), vi.fn()];
    const stopInbox = data.subscribe(inbox);
    const stream = FakeEvents.last;
    const stopDelegation = data.subscribe(delegation);
    expect(FakeEvents.last).toBe(stream);
    stream?.listeners.get("changes")?.();
    expect([inbox.mock.calls.length, delegation.mock.calls.length]).toEqual([1, 1]);
    stopInbox();
    expect(stream?.closed).toBe(false);
    stopDelegation();
    expect(stream?.closed).toBe(true);
  });

  it("reads and switches delegated mode on the server (AC3)", async () => {
    const view = {
      on: true,
      by: "Ana",
      at: "2026-10-24T10:00:00Z",
      warning: { es: ["a"], en: ["b"] },
    };
    const requests = serverAnswering({
      "/api/delegation": [200, view],
      "/api/session": SESSION,
    });
    const data = new ServerData();
    expect(await data.delegation()).toEqual(view);
    serverAnswering({ "/api/delegation": [200, { on: true }] });
    await expect(data.delegation()).rejects.toThrow("The server returned unexpected data.");
    const posted = serverAnswering({ "/api/session": SESSION, "/api/delegation": [200, {}] });
    await data.setDelegation(false);
    expect(requests.map(({ url }) => url)).toEqual(["/api/delegation"]);
    expect(posted.map(({ url, init }) => [url, init?.method ?? "GET", init?.body ?? ""])).toEqual([
      ["/api/session", "GET", ""],
      ["/api/delegation", "POST", '{"on":false}'],
    ]);
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

/**
 * A local server inside `fetch`: it answers by path, a text as it is and anything else as JSON,
 * and keeps every request.
 */
function serverAnswering(answers: Readonly<Record<string, readonly [number, unknown]>>) {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
  const fetched = vi.fn((url: string, init?: RequestInit) => {
    requests.push({ url, ...(init === undefined ? {} : { init }) });
    const [status, body] = answers[url] ?? [404, { error: "not found" }];
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status }));
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
        [
          "approve",
          "assumptions/A1",
          "comments",
          "request-changes",
          "scope/S1",
          "accept",
          "adjust",
          "close",
        ].map((verb) => [at(verb), [200, { status: "ok" }] as const]),
      ),
    });
    const data = new ServerData();
    await data.approve(CHANGE, 2);
    await data.decideAssumption(CHANGE, "A1", "rejected", "Por trimestres.");
    await data.addComment(CHANGE, { section: "design", quote: "saludo" }, "Más corto.");
    await data.requestChanges(CHANGE);
    await data.decideScope(CHANGE, "S1", "approved");
    await data.decideResult(CHANGE, { kind: "accept" });
    await data.decideResult(CHANGE, { kind: "adjust", request: "Más corto." });
    await data.confirmClosing(CHANGE);
    expect(requests.map(({ url, init }) => [url, init?.method ?? "GET", init?.body ?? ""])).toEqual(
      [
        ["/api/session", "GET", ""],
        [at("approve"), "POST", '{"revision":2}'],
        [at("assumptions/A1"), "POST", '{"decision":"rejected","comment":"Por trimestres."}'],
        [
          at("comments"),
          "POST",
          '{"anchor":{"section":"design","quote":"saludo"},"body":"Más corto."}',
        ],
        [at("request-changes"), "POST", "{}"],
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
    const nothing = {
      status: "blocked",
      blocks: [{ lines: ["No hay comentarios sin resolver ni supuestos rechazados que pedir."] }],
      next: "comenta lo que debe cambiar, o aprueba la spec.",
    };
    serverAnswering({ "/api/session": SESSION, [at("request-changes")]: [409, nothing] });
    expect(await reason(new ServerData().requestChanges(CHANGE))).toBe(
      "No hay comentarios sin resolver ni supuestos rechazados que pedir. Comenta lo que debe cambiar, o aprueba la spec.",
    );
    expect(await reason(new ServerData().verifyChange())).toContain(
      "aún no admite esto desde la UI",
    );
  });

  it("reads the diff of a task or of the whole change, and says why there is none (AC3, AC4)", async () => {
    const text = "diff --git a/src/app.ts b/src/app.ts\n";
    const requests = serverAnswering({
      [at("diff")]: [200, text],
      [at("diff?task=T%201")]: [200, ""],
    });
    const data = new ServerData();
    expect(await data.diff(CHANGE)).toBe(text);
    expect(await data.diff(CHANGE, "T 1")).toBe("");
    expect(requests.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
      [at("diff"), "GET"],
      [at("diff?task=T%201"), "GET"],
    ]);
    serverAnswering({ [at("diff")]: [413, { error: "too large", range: "5d2a7b0..3c9d1e2" }] });
    expect(await reason(data.diff(CHANGE))).toBe(
      "El diff pasa de 512 KB y no cabe aquí: míralo con `git diff 5d2a7b0..3c9d1e2` en la carpeta del cambio.",
    );
    serverAnswering({ [at("diff")]: [413, {}] });
    expect(await reason(data.diff(CHANGE))).toContain("míralo con `git diff` en la carpeta");
    serverAnswering({});
    expect(await reason(data.diff(CHANGE))).toContain("aún no hay commits de esta tarea");
    serverAnswering({ [at("diff")]: [403, { error: "forbidden" }] });
    expect(await reason(data.diff(CHANGE))).toContain("Esta pestaña no tiene sesión");
    serverAnswering({ [at("diff")]: [500, { error: "git" }] });
    expect(await reason(data.diff(CHANGE))).toBe("El servidor respondió 500.");
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
