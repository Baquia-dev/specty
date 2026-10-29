// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { MCP_HOST, McpAppData, type McpHost } from "./mcp-app";
import { type ChangeRecord, SpectyData } from "./records";
import { sampleRecords } from "./sample-records";

type Message = Readonly<Record<string, unknown>>;

const isMessage = (value: unknown): value is Message =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The MCP Apps host as the view sees it: it records what the view posts, answers each request
 * with `answer` (as the host, or the server behind it, would) and can send notifications.
 */
class FakeHost implements McpHost {
  readonly sent: Message[] = [];
  private handler: ((message: unknown) => void) | undefined;

  constructor(private readonly answer: (method: string, params: unknown) => unknown) {}

  post(message: unknown): void {
    if (!isMessage(message)) return;
    this.sent.push(message);
    const { id, method, params } = message;
    if (typeof id !== "number" || typeof method !== "string") return;
    const result = this.answer(method, params);
    setTimeout(() => this.handler?.({ jsonrpc: "2.0", id, result }));
  }

  listen(handler: (message: unknown) => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = undefined;
    };
  }

  emit(message: Message): void {
    this.handler?.(message);
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** The source on a host whose server gives `record` for any folder. */
function sourceWith(record: ChangeRecord) {
  const host = new FakeHost((method) =>
    method === "ui/initialize"
      ? {
          protocolVersion: "2026-01-26",
          hostCapabilities: {},
          hostInfo: { name: "test", version: "1" },
          hostContext: {},
        }
      : { content: [{ type: "text", text: "1" }], structuredContent: { records: [record] } },
  );
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MCP_HOST, useValue: host },
      { provide: SpectyData, useClass: McpAppData },
    ],
  });
  return { host, source: TestBed.inject(SpectyData) };
}

const inReview = () => {
  const record = sampleRecords(Date.now()).find((candidate) => candidate.state.phase === "review");
  if (record === undefined) throw new Error("the sample has no change in review");
  return record;
};

const inPhase = (phase: string) => {
  const record = sampleRecords(Date.now()).find((candidate) => candidate.state.phase === phase);
  if (record === undefined) throw new Error(`the sample has no change in ${phase}`);
  return record;
};

/** The source on a host whose server answers `specty_view` with `view(arguments)`. */
function sourceOn(view: (args: Message) => unknown, hostContext: Message = {}) {
  const host = new FakeHost((method, params) => {
    if (method === "ui/initialize") {
      return {
        protocolVersion: "2026-01-26",
        hostCapabilities: {},
        hostInfo: { name: "test", version: "1" },
        hostContext,
      };
    }
    const args = isMessage(params) && isMessage(params.arguments) ? params.arguments : {};
    return method === "tools/call" ? view(args) : {};
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MCP_HOST, useValue: host },
      { provide: SpectyData, useClass: McpAppData },
    ],
  });
  return { host, source: TestBed.inject(SpectyData) };
}

/** What `specty_view` answers: `data` as structured content and as JSON text. */
const answered = (data: Message) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

const toolInput = (folder: string): Message => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-input",
  params: { arguments: { folder } },
});

/** The arguments of each `specty_view` the view asked, in order. */
const viewCalls = (host: FakeHost) =>
  host.sent
    .filter((message) => message.method === "tools/call")
    .map((message) => (isMessage(message.params) ? message.params.arguments : undefined));

describe("the data source of the MCP App", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: greets the host, and on a tool's result reads that folder's change with specty_view", async () => {
    const record = inReview();
    const { host, source } = sourceWith(record);
    const changed = new Promise<void>((done) => {
      source.subscribe(() => done());
    });
    await settle();
    expect(host.sent.map((message) => message.method).slice(0, 2)).toEqual([
      "ui/initialize",
      "ui/notifications/initialized",
    ]);
    host.emit({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        content: [{ type: "text", text: "SPECTY · …" }],
        structuredContent: { folder: "/repo/change" },
      },
    });
    await changed;
    expect(host.sent).toContainEqual(
      expect.objectContaining({
        method: "tools/call",
        params: { name: "specty_view", arguments: { folder: "/repo/change" } },
      }),
    );
    expect(await source.changes()).toEqual([record]);
  });

  it("AC2: lets the person decide nothing, and says where they can", async () => {
    const { source } = sourceWith(inReview());
    const reason = await source.readOnly();
    expect(reason?.es).toContain("specty ui");
    expect(reason?.en).toContain("specty ui");
    await expect(source.approve("any", 1)).rejects.toThrow();
    await expect(source.decideResult("any", { kind: "accept" })).rejects.toThrow();
  });
});

describe("the data source of the MCP App, live", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("AC1: reads the change of the folder in the call's arguments, before its result", async () => {
    vi.useFakeTimers();
    const record = inPhase("review");
    const { host, source } = sourceOn(() => answered({ fingerprint: "a", records: [record] }));
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    expect(viewCalls(host)).toEqual([{ folder: "/repo/change" }]);
    expect(await source.changes()).toEqual([record]);
  });

  it("AC4: asks again every second with its fingerprint while the change moves", async () => {
    vi.useFakeTimers();
    const record = inPhase("implementing");
    let asked = 0;
    const { host, source } = sourceOn(() => {
      asked += 1;
      if (asked === 1) return answered({ fingerprint: "a", records: [record] });
      return asked === 2
        ? answered({ fingerprint: "a", unchanged: true })
        : answered({ fingerprint: "b", records: [record] });
    });
    let heard = 0;
    source.subscribe(() => {
      heard += 1;
    });
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    expect(heard).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    // With the id of the change it shows, too (C3, A5).
    const again = { folder: "/repo/change", since: "a", change: record.state.id };
    expect(viewCalls(host)[1]).toEqual(again);
    expect(heard).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(viewCalls(host)[2]).toEqual(again);
    expect(heard).toBe(2);
  });

  it("AC4: does not ask again for a change that waits for a person", async () => {
    vi.useFakeTimers();
    const { host } = sourceOn(() => answered({ fingerprint: "a", records: [inPhase("review")] }));
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(viewCalls(host)).toHaveLength(1);
  });

  it("AC4: gives the verification going on to whoever watches the change", async () => {
    vi.useFakeTimers();
    const record = inPhase("implementing");
    const run = {
      task: "T1",
      command: "npm test",
      startedAt: "2026-10-29T10:00:00.000Z",
      output: ["✓ greets Ana"],
    };
    const { host, source } = sourceOn(() => answered({ fingerprint: "a", records: [record], run }));
    const runs: unknown[] = [];
    source.watchRun(record.state.id, (current) => runs.push(current));
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    expect(runs.at(-1)).toEqual(run);
  });

  it("AC5: asks to be pinned when the host offers pip and the change is in progress", async () => {
    vi.useFakeTimers();
    const { host } = sourceOn(
      () => answered({ fingerprint: "a", records: [inPhase("implementing")] }),
      { availableDisplayModes: ["inline", "pip"] },
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(host.sent.find((message) => message.method === "ui/initialize")?.params).toMatchObject({
      appCapabilities: { availableDisplayModes: ["inline", "pip"] },
    });
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    expect(host.sent).toContainEqual(
      expect.objectContaining({ method: "ui/request-display-mode", params: { mode: "pip" } }),
    );
  });

  it("AC5: does not ask to be pinned without pip, or for a change outside progress", async () => {
    vi.useFakeTimers();
    for (const [phase, modes] of [
      ["implementing", ["inline"]],
      ["review", ["inline", "pip"]],
    ] as const) {
      const { host } = sourceOn(() => answered({ fingerprint: "a", records: [inPhase(phase)] }), {
        availableDisplayModes: modes,
      });
      await vi.advanceTimersByTimeAsync(10);
      host.emit(toolInput("/repo/change"));
      await vi.advanceTimersByTimeAsync(10);
      const asked = host.sent.filter((message) => message.method === "ui/request-display-mode");
      expect(asked, phase).toEqual([]);
    }
  });

  it("AC6: says why when no change is open in the folder", async () => {
    vi.useFakeTimers();
    const { host, source } = sourceOn(() => answered({ fingerprint: "a", records: [] }));
    let heard = 0;
    source.subscribe(() => {
      heard += 1;
    });
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    expect(heard).toBe(1);
    await expect(source.changes()).rejects.toMatchObject({
      text: { es: expect.stringContaining("ningún cambio abierto") },
    });
  });

  it("AC6: reads the data from the text when the host gives no structured content", async () => {
    vi.useFakeTimers();
    const record = inPhase("review");
    const text = JSON.stringify({ fingerprint: "a", records: [record] });
    const { host, source } = sourceOn(() => ({ content: [{ type: "text", text }] }));
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    expect(await source.changes()).toEqual([record]);
  });

  it("AC6: says why when the answer cannot be read", async () => {
    vi.useFakeTimers();
    const { host, source } = sourceOn(() => ({ content: [{ type: "text", text: "not json" }] }));
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(10);
    await expect(source.changes()).rejects.toMatchObject({
      text: { es: expect.stringContaining("No pude leer") },
    });
  });

  it("AC7: tells its size only after the host heard it is initialized", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly heard: () => void) {}
        observe() {
          this.heard();
        }
        disconnect() {}
      },
    );
    const { host } = sourceOn(() => answered({ fingerprint: "a", records: [] }));
    await vi.advanceTimersByTimeAsync(10);
    const methods = host.sent.map((message) => message.method);
    expect(methods).toContain("ui/notifications/size-changed");
    expect(methods.indexOf("ui/notifications/size-changed")).toBeGreaterThan(
      methods.indexOf("ui/notifications/initialized"),
    );
  });
});

describe("the data source of the MCP App, by change", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("AC3: asks with the id of the change it shows, and stops once it is done", async () => {
    vi.useFakeTimers();
    const closing = inPhase("closing");
    const done: ChangeRecord = { ...closing, state: { ...closing.state, phase: "done" } };
    let asked = 0;
    const { host, source } = sourceOn(() => {
      asked += 1;
      return asked === 1
        ? answered({ fingerprint: "a", records: [closing] })
        : answered({ fingerprint: "b", records: [done] });
    });
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/change"));
    await vi.advanceTimersByTimeAsync(1010);
    expect(viewCalls(host)[1]).toEqual({
      folder: "/repo/change",
      since: "a",
      change: closing.state.id,
    });
    expect((await source.changes())[0]?.state.phase).toBe("done");
    await vi.advanceTimersByTimeAsync(5000);
    expect(viewCalls(host)).toHaveLength(2);
  });

  it("AC4: reads the change a tool's card names, though its folder has none open", async () => {
    vi.useFakeTimers();
    const record = inPhase("draft");
    const { host, source } = sourceOn((args) =>
      args.change === record.state.id
        ? answered({ fingerprint: "a", records: [record] })
        : answered({ fingerprint: "", records: [] }),
    );
    await vi.advanceTimersByTimeAsync(10);
    host.emit(toolInput("/repo/main"));
    await vi.advanceTimersByTimeAsync(10);
    host.emit({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        content: [
          {
            type: "text",
            text: `SPECTY · ${record.state.id} · draft\nCambio creado.\nSIGUIENTE: escribe la spec.`,
          },
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(viewCalls(host).at(-1)).toMatchObject({ folder: "/repo/main", change: record.state.id });
    expect(await source.changes()).toEqual([record]);
  });
});
