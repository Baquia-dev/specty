// SPDX-License-Identifier: Apache-2.0
// The full verification through ServerData: started in the server, followed through its events.
import type { RunRecord } from "./progress";
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

  /** The server sends `run` for `change`. */
  run(change: string, run: RunRecord | null): void {
    this.listeners.get("run")?.({ data: JSON.stringify({ change, run }) });
  }
}

const CHANGE = "20261024-saludo";
const RUN: RunRecord = {
  command: "pnpm check",
  startedAt: "2026-10-24T10:00:00Z",
  output: ["uno"],
};

/** `fetch` answering by path, each answer when its promise says; it keeps every request. */
function serverAnswering(
  answers: Readonly<Record<string, () => Promise<readonly [number, unknown]>>>,
) {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      const [status, body] = (await answers[url]?.()) ?? [404, { error: "not found" }];
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return requests;
}

const now = (status: number, body: unknown) => () => Promise.resolve([status, body] as const);
const settled = () => new Promise((done) => setTimeout(done));

describe("the full verification through the local server", () => {
  beforeEach(() => vi.stubGlobal("EventSource", FakeEvents));
  afterEach(() => vi.unstubAllGlobals());

  it("starts in the server with the CSRF token (AC1)", async () => {
    const requests = serverAnswering({
      "/api/session": now(200, { actions: true, csrf: "t0k3n" }),
      [`/api/changes/${CHANGE}/verify`]: now(200, { status: "ok" }),
    });
    await new ServerData().verifyChange(CHANGE);
    expect(requests.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/session", "GET"],
      [`/api/changes/${CHANGE}/verify`, "POST"],
    ]);
    expect(new Headers(requests[1]?.init?.headers).get("X-Specty-CSRF")).toBe("t0k3n");
  });

  it("follows a run from what it has so far, line by line, until it ends (AC1, AC4)", async () => {
    serverAnswering({ [`/api/changes/${CHANGE}/run`]: now(200, RUN) });
    const data = new ServerData();
    const heard: (RunRecord | undefined)[] = [];
    const stop = data.watchRun(CHANGE, (run) => heard.push(run));
    await settled();
    const stream = FakeEvents.last;
    expect(stream?.url).toBe("/api/events");
    stream?.run("20990101-otro", { ...RUN, output: ["ajeno"] });
    const next = { ...RUN, output: ["uno", "dos"] };
    stream?.run(CHANGE, next);
    stream?.run(CHANGE, null);
    stream?.listeners.get("run")?.({ data: "no es JSON" });
    expect(heard).toEqual([RUN, next, undefined]);
    stop();
    expect(stream?.closed).toBe(true);
  });

  it("lets an event that comes first win over the slower answer (AC4)", async () => {
    let answer: (value: readonly [number, unknown]) => void = () => undefined;
    serverAnswering({
      [`/api/changes/${CHANGE}/run`]: () => new Promise((done) => (answer = done)),
    });
    const heard: (RunRecord | undefined)[] = [];
    new ServerData().watchRun(CHANGE, (run) => heard.push(run));
    FakeEvents.last?.run(CHANGE, null);
    answer([200, RUN]);
    await settled();
    expect(heard).toEqual([undefined]);
  });

  it("shares the event stream with the changes, and tells nothing runs when it cannot ask", async () => {
    serverAnswering({ [`/api/changes/${CHANGE}/run`]: now(403, { error: "forbidden" }) });
    const data = new ServerData();
    const stopChanges = data.subscribe(() => undefined);
    const stream = FakeEvents.last;
    const heard: (RunRecord | undefined)[] = [];
    const stopRun = data.watchRun(CHANGE, (run) => heard.push(run));
    await settled();
    expect(FakeEvents.last).toBe(stream);
    expect(heard).toEqual([undefined]);
    stopRun();
    expect(stream?.closed).toBe(false);
    stopChanges();
    expect(stream?.closed).toBe(true);
  });
});
