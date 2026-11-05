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

  it("AC1: reads one change of the local server by its id", async () => {
    const [record] = sampleRecords(Date.now());
    const fetched = answering(200, record);
    expect(await new ServerData().change("2026 una/otra")).toEqual(record);
    expect(fetched).toHaveBeenCalledWith("/api/changes/2026%20una%2Fotra");
  });

  it("AC2: gives no change for an id the server does not know, and explains why it could not ask", async () => {
    answering(404, { error: "not found" });
    expect(await new ServerData().change("20990101-no-existe")).toBeUndefined();
    const why = async () => {
      const error: unknown = await new ServerData()
        .change("20990101-no-existe")
        .catch((caught: unknown) => caught);
      return error instanceof ActionError ? error.text.es : "no falló con su motivo";
    };
    answering(403, { error: "forbidden" });
    expect(await why()).toBe(
      "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
    );
    answering(500, {});
    expect(await why()).toBe("El servidor respondió 500.");
    answering(200, { spec: "# Sin estado" });
    expect(await why()).toBe("El servidor devolvió datos inesperados.");
  });

  it("AC1: any other source finds one change among the ones it gives", async () => {
    const records = sampleRecords(Date.now());
    class Listed extends SpectyData {
      changes(): Promise<readonly ChangeRecord[]> {
        return Promise.resolve(records);
      }

      subscribe(): () => void {
        return () => undefined;
      }
    }
    const [first] = records;
    expect(await new Listed().change(first?.state.id ?? "")).toEqual(first);
    expect(await new Listed().change("20990101-no-existe")).toBeUndefined();
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
