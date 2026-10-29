// SPDX-License-Identifier: Apache-2.0
import { DestroyRef, Injectable, InjectionToken, inject } from "@angular/core";
import { type Bilingual, type ChangeRecord, SpectyData } from "./records";
import { isRecords } from "./server-answers";

/**
 * The data source of an MCP App (ADR 0015): the view runs in the chat of an MCP host, in a
 * sandboxed iframe, and speaks JSON-RPC 2.0 with the host over `postMessage`. It greets the host
 * (`ui/initialize`), learns from each tool's result the folder the tool ran in, and reads that
 * folder's change with `specty_view`, a tool only the app can call. It only reads: the person
 * decides in the terminal or in `specty ui`.
 */

/** The host as the view sees it: where its messages go, and where the host's come from. */
export interface McpHost {
  post(message: unknown): void;
  listen(handler: (message: unknown) => void): () => void;
}

/** The host is the window that frames the view. */
export const MCP_HOST = new InjectionToken<McpHost>("MCP_HOST", {
  providedIn: "root",
  factory: () => ({
    post: (message) => window.parent.postMessage(message, "*"),
    listen: (handler) => {
      const listener = (event: MessageEvent) => {
        if (event.source === window.parent) handler(event.data);
      };
      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    },
  }),
});

/** The version of MCP Apps the view speaks. */
const APPS_VERSION = "2026-01-26";

const READ_ONLY: Bilingual = {
  es: "En el chat, Specty es solo para ver: decide en la terminal o en `specty ui`.",
  en: "In the chat, Specty is for reading only: decide in the terminal or in `specty ui`.",
};

type Message = Readonly<Record<string, unknown>>;

const isMessage = (value: unknown): value is Message =>
  typeof value === "object" && value !== null && !Array.isArray(value);

@Injectable()
export class McpAppData extends SpectyData {
  private readonly host = inject(MCP_HOST);
  private records: readonly ChangeRecord[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<number, (result: unknown) => void>();
  private next = 1;

  constructor() {
    super();
    inject(DestroyRef).onDestroy(this.host.listen((message) => this.receive(message)));
    void this.request("ui/initialize", {
      protocolVersion: APPS_VERSION,
      appInfo: { name: "specty", version: "1" },
      appCapabilities: { availableDisplayModes: ["inline"] },
    }).then(() => this.host.post({ jsonrpc: "2.0", method: "ui/notifications/initialized" }));
  }

  override changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(this.records);
  }

  override subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve(READ_ONLY);
  }

  /** A message from the host: an answer to one of ours, a notification, or a request. */
  private receive(message: unknown): void {
    if (!isMessage(message)) return;
    const { id, method, params } = message;
    if (typeof id === "number" && method === undefined) {
      this.pending.get(id)?.(message.result);
      this.pending.delete(id);
      return;
    }
    if (method === "ui/notifications/tool-result") void this.read(folderOf(params));
    // Before taking the view down, and when asked if it is there, the host waits for an answer.
    if ((method === "ui/resource-teardown" || method === "ping") && id !== undefined) {
      this.host.post({ jsonrpc: "2.0", id, result: {} });
    }
  }

  /** The change of `folder`, from the server, to whoever listens. */
  private async read(folder: string | undefined): Promise<void> {
    if (folder === undefined) return;
    const result = await this.request("tools/call", {
      name: "specty_view",
      arguments: { folder },
    });
    const records =
      isMessage(result) && isMessage(result.structuredContent)
        ? result.structuredContent.records
        : undefined;
    if (!isRecords(records)) return;
    this.records = records;
    for (const listener of this.listeners) listener();
  }

  private request(method: string, params: Message): Promise<unknown> {
    const id = this.next++;
    return new Promise((done) => {
      this.pending.set(id, done);
      this.host.post({ jsonrpc: "2.0", id, method, params });
    });
  }
}

/** The folder a tool ran in, from its result's `structuredContent`. */
function folderOf(params: unknown): string | undefined {
  const content = isMessage(params) ? params.structuredContent : undefined;
  const folder = isMessage(content) ? content.folder : undefined;
  return typeof folder === "string" ? folder : undefined;
}
