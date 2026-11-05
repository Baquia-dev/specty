// SPDX-License-Identifier: Apache-2.0
// What the tests of the MCP App's data source share: a fake host that answers the view's
// requests, the source on it, and the messages and samples they send and read.
import { TestBed } from "@angular/core/testing";
import { MCP_HOST, McpAppData, type McpHost } from "../mcp-app";
import { type ChangeRecord, SpectyData } from "../records";
import { sampleRecords } from "../sample-records";

type Message = Readonly<Record<string, unknown>>;

export const isMessage = (value: unknown): value is Message =>
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

export const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** The source on a host whose server gives `record` for any folder. */
export function sourceWith(record: ChangeRecord) {
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

export const inReview = () => {
  const record = sampleRecords(Date.now()).find((candidate) => candidate.state.phase === "review");
  if (record === undefined) throw new Error("the sample has no change in review");
  return record;
};

export const inPhase = (phase: string) => {
  const record = sampleRecords(Date.now()).find((candidate) => candidate.state.phase === phase);
  if (record === undefined) throw new Error(`the sample has no change in ${phase}`);
  return record;
};

/** The source on a host whose server answers `specty_view` with `view(arguments)`. */
export function sourceOn(view: (args: Message) => unknown, hostContext: Message = {}) {
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
export const answered = (data: Message) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

export const toolInput = (folder: string): Message => ({
  jsonrpc: "2.0",
  method: "ui/notifications/tool-input",
  params: { arguments: { folder } },
});

/** The arguments of each `specty_view` the view asked, in order. */
export const viewCalls = (host: FakeHost) =>
  host.sent
    .filter((message) => message.method === "tools/call")
    .map((message) => (isMessage(message.params) ? message.params.arguments : undefined));
