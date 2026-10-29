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
