// SPDX-License-Identifier: Apache-2.0
import { DestroyRef, Injectable, InjectionToken, inject } from "@angular/core";
import type { Phase } from "@baquia-dev/specty-core/light";
import { HostLook } from "../theme/host-look";
import type { RunRecord } from "./progress";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "./records";
import { isRecords, isRun } from "./server-answers";

/**
 * The data source of an MCP App (ADR 0015): the view runs in the chat of an MCP host, in a
 * sandboxed iframe, and speaks JSON-RPC 2.0 with the host over `postMessage`. It greets the host
 * (`ui/initialize`), learns from each tool's arguments the folder the tool runs in, and reads that
 * folder's change with `specty_view`, a tool only the app can call: again every second while the
 * change moves, with the fingerprint of what it has. It takes the chat's look from the host
 * (`HostLook`) and tells it the height of its content. It only reads: the person decides in the
 * terminal or in `specty ui`.
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

/** How long, in milliseconds, the view waits after an answer to ask again while the change moves. */
const EVERY = 1000;

/** The phases in which the change moves without a person: the view keeps asking. */
const MOVING: ReadonlySet<Phase> = new Set([
  "testing",
  "implementing",
  "adjusting",
  "acceptance",
  "closing",
]);

/** The phases of the Progress tab: the view asks to stay pinned while the agent works. */
const PINNED: ReadonlySet<Phase> = new Set(["testing", "implementing", "adjusting"]);

const READ_ONLY: Bilingual = {
  es: "En el chat, Specty es solo para ver: decide en la terminal o en `specty ui`.",
  en: "In the chat, Specty is for reading only: decide in the terminal or in `specty ui`.",
};
const NO_CHANGE: Bilingual = {
  es: "No hay ningún cambio abierto en esa carpeta.",
  en: "No change is open in that folder.",
};
const UNREADABLE: Bilingual = {
  es: "No pude leer el cambio: la respuesta del servidor no se entiende.",
  en: "I could not read the change: the server's answer makes no sense.",
};

type Message = Readonly<Record<string, unknown>>;

const isMessage = (value: unknown): value is Message =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What `specty_view` answered: that nothing changed, the change with its fingerprint, or nothing readable. */
type ViewAnswer =
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "data";
      readonly fingerprint: string | undefined;
      readonly records: readonly ChangeRecord[];
      readonly run: RunRecord | undefined;
    }
  | { readonly kind: "unreadable" };

@Injectable()
export class McpAppData extends SpectyData {
  private readonly host = inject(MCP_HOST);
  private readonly look = inject(HostLook);
  private records: readonly ChangeRecord[] = [];
  private run: RunRecord | undefined;
  private problem: Bilingual | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly runListeners = new Set<{
    readonly change: string;
    readonly listener: (run: RunRecord | undefined) => void;
  }>();
  private readonly pending = new Map<number, (result: unknown) => void>();
  private next = 1;
  /** The folder of the tool's call: none, and the server uses its own. */
  private folder: string | undefined;
  /**
   * The id of the change the view shows, or the one the tool's card names: the server finds it
   * in its own folder, or archived once it closed.
   */
  private change: string | undefined;
  /** The fingerprint of what the view has. */
  private fingerprint: string | undefined;
  /** The display modes the host offers. */
  private modes: readonly unknown[] = [];
  private pinned = false;
  /** The last read asked: the answer of an older one comes too late. */
  private reads = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private observer: ResizeObserver | undefined;
  private closed = false;

  constructor() {
    super();
    const unlisten = this.host.listen((message) => this.receive(message));
    inject(DestroyRef).onDestroy(() => {
      unlisten();
      this.stop();
    });
    void this.request("ui/initialize", {
      protocolVersion: APPS_VERSION,
      appInfo: { name: "specty", version: "1" },
      appCapabilities: { availableDisplayModes: ["inline", "pip"] },
    }).then((answer) => {
      this.modes = modesOf(answer);
      this.look.take(isMessage(answer) ? answer.hostContext : undefined);
      this.host.post({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
      this.observeSize();
    });
  }

  override changes(): Promise<readonly ChangeRecord[]> {
    return this.problem === undefined
      ? Promise.resolve(this.records)
      : Promise.reject(new ActionError(this.problem));
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

  override watchRun(change: string, listener: (run: RunRecord | undefined) => void): () => void {
    const watcher = { change, listener };
    this.runListeners.add(watcher);
    listener(this.runOf(change));
    return () => {
      this.runListeners.delete(watcher);
    };
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
    if (typeof method === "string") this.heard(method, isMessage(params) ? params : {});
    // Before taking the view down, and when asked if it is there, the host waits for an answer.
    if ((method === "ui/resource-teardown" || method === "ping") && id !== undefined) {
      this.host.post({ jsonrpc: "2.0", id, result: {} });
    }
  }

  /**
   * What the host tells: the tool's arguments, its result, that its look changed, or that it
   * takes the view down.
   */
  private heard(method: string, params: Message): void {
    switch (method) {
      case "ui/notifications/host-context-changed":
        this.look.take(params);
        return;
      case "ui/notifications/tool-input":
        this.folder = folderIn(params.arguments);
        void this.read();
        return;
      case "ui/notifications/tool-result":
        // The tool already changed the change: read it again. An older server names the folder,
        // and the card names the change, as `specty new`'s, made in a folder of its own.
        this.folder = folderIn(params.structuredContent) ?? this.folder;
        this.change = changeIn(params.content) ?? this.change;
        void this.read();
        return;
      case "ui/resource-teardown":
        this.stop();
    }
  }

  /** Asks the server for the change, and tells whoever listens if it moved. */
  private async read(): Promise<void> {
    if (this.closed) return;
    clearTimeout(this.timer);
    const asked = ++this.reads;
    const since = this.fingerprint === undefined ? {} : { since: this.fingerprint };
    const folder = this.folder === undefined ? {} : { folder: this.folder };
    const change = this.change === undefined ? {} : { change: this.change };
    const answer = viewOf(
      await this.request("tools/call", {
        name: "specty_view",
        arguments: { ...folder, ...since, ...change },
      }),
    );
    if (this.closed || asked !== this.reads) return;
    if (answer.kind !== "unchanged") this.take(answer);
    const phase = this.records[0]?.state.phase;
    if (phase !== undefined && MOVING.has(phase)) {
      this.timer = setTimeout(() => void this.read(), EVERY);
    }
  }

  /** What the server answered, for the view: the change and its run, or why there is none. */
  private take(answer: Exclude<ViewAnswer, { readonly kind: "unchanged" }>): void {
    if (answer.kind === "unreadable") {
      this.problem = UNREADABLE;
      this.records = [];
      this.run = undefined;
    } else {
      this.problem = answer.records.length === 0 ? NO_CHANGE : undefined;
      this.records = answer.records;
      this.run = answer.run;
      this.fingerprint = answer.fingerprint;
      this.change = answer.records[0]?.state.id ?? this.change;
    }
    for (const listener of this.listeners) listener();
    for (const { change, listener } of this.runListeners) listener(this.runOf(change));
    this.pin();
  }

  /** Asks the host, once, to keep the view in sight while the agent works, if it can. */
  private pin(): void {
    const phase = this.records[0]?.state.phase;
    if (this.pinned || phase === undefined || !PINNED.has(phase) || !this.modes.includes("pip")) {
      return;
    }
    this.pinned = true;
    void this.request("ui/request-display-mode", { mode: "pip" });
  }

  /** The run going on in `change`, if it is the one the view shows. */
  private runOf(change: string): RunRecord | undefined {
    return this.records[0]?.state.id === change ? this.run : undefined;
  }

  /** The host sizes the frame to the view: it hears each change of size, once it knows the view. */
  private observeSize(): void {
    if (this.closed || typeof ResizeObserver === "undefined") return;
    this.observer = new ResizeObserver(() => {
      const { width, height } = contentSize(document.documentElement);
      this.host.post({
        jsonrpc: "2.0",
        method: "ui/notifications/size-changed",
        params: { width, height },
      });
    });
    this.observer.observe(document.body);
  }

  /** Stops asking and observing: the host takes the view down. */
  private stop(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.observer?.disconnect();
  }

  private request(method: string, params: Message): Promise<unknown> {
    const id = this.next++;
    return new Promise((done) => {
      this.pending.set(id, done);
      this.host.post({ jsonrpc: "2.0", id, method, params });
    });
  }
}

/**
 * The size of the content, not of the frame: `scrollHeight` never drops under the frame's height,
 * so a card that closes would leave its space. As the ext-apps SDK does, the root is measured at
 * `max-content` for a moment.
 */
function contentSize(root: HTMLElement): { width: number; height: number } {
  const before = root.style.height;
  root.style.height = "max-content";
  const height = Math.ceil(root.getBoundingClientRect().height);
  root.style.height = before;
  return { width: root.scrollWidth, height };
}

/** The folder in a tool's arguments, or in the structured content of an older server's result. */
function folderIn(value: unknown): string | undefined {
  const folder = isMessage(value) ? value.folder : undefined;
  return typeof folder === "string" ? folder : undefined;
}

/** The display modes the host offers, from its answer to `ui/initialize`. */
function modesOf(answer: unknown): readonly unknown[] {
  const context = isMessage(answer) ? answer.hostContext : undefined;
  const modes = isMessage(context) ? context.availableDisplayModes : undefined;
  return Array.isArray(modes) ? modes : [];
}

/** What `specty_view` answered: its structured content or, from a host that gives only the text, its JSON. */
function viewOf(result: unknown): ViewAnswer {
  const data =
    isMessage(result) && isMessage(result.structuredContent)
      ? result.structuredContent
      : jsonOf(isMessage(result) ? result.content : undefined);
  if (!isMessage(data)) return { kind: "unreadable" };
  if (data.unchanged === true) return { kind: "unchanged" };
  if (!isRecords(data.records)) return { kind: "unreadable" };
  return {
    kind: "data",
    fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : undefined,
    records: data.records,
    run: isRun(data.run) ? data.run : undefined,
  };
}

/** A card's first line names its change: `SPECTY · <id> · <phase>`. */
const HEADER = /^SPECTY · (\d{8}-[^\s·]+)/;

/** The change a tool's card names in its first line, if it names one. */
function changeIn(content: unknown): string | undefined {
  return HEADER.exec(textOf(content) ?? "")?.[1];
}

/** The JSON of a result's first text, if it is JSON. */
function jsonOf(content: unknown): unknown {
  const text = textOf(content);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A result's first text. */
function textOf(content: unknown): string | undefined {
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  return isMessage(first) && typeof first.text === "string" ? first.text : undefined;
}
