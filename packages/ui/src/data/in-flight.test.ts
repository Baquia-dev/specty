// SPDX-License-Identifier: Apache-2.0
// The acceptances and closings in flight, with what the local server says of them as they go.
import { TestBed } from "@angular/core/testing";
import { InFlight } from "./in-flight";
import { SpectyData } from "./records";
import { ServerData } from "./server";

/** jsdom has no EventSource: this one is driven by the test, with the data of each event. */
class FakeEvents {
  static last: FakeEvents | undefined;
  readonly listeners = new Map<string, (event: { readonly data: string }) => void>();
  closed = false;

  constructor(readonly url: string) {
    FakeEvents.last = this;
  }

  addEventListener(type: string, listener: (event: { readonly data: string }) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  /** The server sends `action` with `told`, as JSON. */
  action(told: unknown): void {
    this.raw(JSON.stringify(told));
  }

  /** The server sends `action` with `data` as it comes. */
  raw(data: string): void {
    this.listeners.get("action")?.({ data });
  }
}

const CHANGE = "20261106-saludo";
const WAIT =
  "specty: otra sesión está haciendo una verificación completa (`pnpm check` en /otra/carpeta, desde las 08:00 UTC); espero a que termine para no correr dos a la vez…";
const SHOWN =
  "Otra sesión está haciendo una verificación completa (`pnpm check` en /otra/carpeta, desde las 08:00 UTC); espero a que termine para no correr dos a la vez…";

/** The tab's actions in flight, on the local server's data. */
function inFlight(): InFlight {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: ServerData }] });
  return TestBed.inject(InFlight);
}

/** A server's answer the test gives when it wants: done, or refused. */
function pending() {
  let answer: () => void = () => undefined;
  let refuse: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    answer = resolve;
    refuse = reject;
  });
  return { promise, answer: () => answer(), refuse: (error: Error) => refuse(error) };
}

describe("an acceptance or a closing in flight, as the local server tells it", () => {
  beforeEach(() => {
    FakeEvents.last = undefined;
    vi.stubGlobal("EventSource", FakeEvents);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("AC2: keeps the last line the server says of that acceptance, without `specty:`, until it says it ended", async () => {
    const flight = inFlight();
    const server = pending();
    const accepting = flight.run(CHANGE, "accept", server.promise);
    const stream = FakeEvents.last;
    expect(stream?.url).toBe("/api/events");

    stream?.action({ change: CHANGE, action: "accept" });
    expect(flight.of(CHANGE)).toEqual({ kind: "accept" });
    stream?.action({ change: CHANGE, action: "accept", note: WAIT });
    expect(flight.of(CHANGE)).toEqual({ kind: "accept", note: SHOWN });

    stream?.action({ change: "20990101-otro", action: "accept", note: "specty: ajena" });
    stream?.action({ change: CHANGE, action: "close", note: "specty: de otra acción" });
    stream?.raw("no es JSON");
    stream?.action({ change: CHANGE, note: "specty: sin acción" });
    expect(flight.of(CHANGE)).toEqual({ kind: "accept", note: SHOWN });

    stream?.action({ change: CHANGE, action: "accept", note: "specty: tras incorporarlo…" });
    expect(flight.of(CHANGE)).toEqual({ kind: "accept", note: "Tras incorporarlo…" });
    stream?.action({ change: CHANGE, action: "accept", done: true });
    expect(flight.of(CHANGE)).toEqual({ kind: "accept" });

    server.answer();
    await accepting;
    expect(flight.of(CHANGE)).toBeUndefined();
    expect(stream?.closed).toBe(true);
  });

  it("AC2: keeps the line of a closing until it fails, and none after it ended", async () => {
    const flight = inFlight();
    const server = pending();
    const closing = flight.run(CHANGE, "close", server.promise);
    const stream = FakeEvents.last;
    stream?.action({ change: CHANGE, action: "close", note: WAIT });
    expect(flight.of(CHANGE)).toEqual({ kind: "close", note: SHOWN });

    server.refuse(new Error("rechazado"));
    await expect(closing).rejects.toThrow("rechazado");
    expect(flight.of(CHANGE)).toBeUndefined();
    stream?.action({ change: CHANGE, action: "close", note: WAIT });
    expect(flight.of(CHANGE)).toBeUndefined();
    expect(stream?.closed).toBe(true);
  });
});
