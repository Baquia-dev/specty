// SPDX-License-Identifier: Apache-2.0
// The local server's event stream (`GET /api/events`), as ServerData follows it: one stream for
// everyone who listens to its `changes`, `run` and `action` events, closed once nobody does, with
// how the data of each event is read.
import type { RunRecord } from "./progress";
import { isObject, isRun } from "./server-answers";
import type { ActionNote } from "./source";

type RunListener = (change: string, run: RunRecord | undefined) => void;
type ActionListener = (told: ActionNote) => void;

/** How long an action waits for the screens to read again before it ends anyway. */
const REREAD_MS = 10_000;

/**
 * The event stream of one ServerData: opened once for every subscriber (the Inbox, delegated
 * mode, the runs and the actions) and closed when the last one stops listening.
 */
export class ServerEvents {
  private events: EventSource | undefined;
  private readonly listeners = new Set<() => unknown>();
  private readonly runListeners = new Set<RunListener>();
  private readonly actionListeners = new Set<ActionListener>();

  /** Every `changes` event: something the screens show changed in the server. */
  subscribe(listener: () => unknown): () => void {
    return this.follow(this.listeners, listener);
  }

  /**
   * The full verification running in `change`: what it has so far, asked to the server, then
   * every `run` event. An event that arrives before that answer is newer, so it wins.
   */
  watchRun(change: string, listener: (run: RunRecord | undefined) => void): () => void {
    let heard = false;
    const told: RunListener = (id, run) => {
      if (id !== change) return;
      heard = true;
      listener(run);
    };
    const stop = this.follow(this.runListeners, told);
    void readRun(change).then((run) => {
      if (!heard && this.runListeners.has(told)) listener(run);
    });
    return stop;
  }

  /** Every `action` event: what the server says of the person's actions as they go on. */
  watchActions(listener: ActionListener): () => void {
    return this.follow(this.actionListeners, listener);
  }

  /**
   * Has every listener of `changes` read again and waits for them, `REREAD_MS` at most: past
   * that, the next `changes` event brings the rest. One that fails does not undo what the server
   * already did.
   */
  async reread(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<void>((done) => {
      timer = setTimeout(done, REREAD_MS);
    });
    const heard = Promise.allSettled([...this.listeners].map(async (listener) => listener()));
    await Promise.race([heard, late]);
    clearTimeout(timer);
  }

  /** Opens the event stream, once, for everyone who listens to it. */
  private listen(): void {
    if (this.events !== undefined) return;
    this.events = new EventSource("/api/events");
    this.events.addEventListener("changes", () => {
      for (const heard of this.listeners) void heard();
    });
    this.events.addEventListener("run", (event: MessageEvent) => {
      const told = runEvent(event.data);
      if (told === undefined) return;
      for (const heard of this.runListeners) heard(told.change, told.run);
    });
    this.events.addEventListener("action", (event: MessageEvent) => {
      const told = actionEvent(event.data);
      if (told === undefined) return;
      for (const heard of this.actionListeners) heard(told);
    });
  }

  /** Adds `listener` to `set` with the event stream open; its stop closes the stream if idle. */
  private follow<T>(set: Set<T>, listener: T): () => void {
    set.add(listener);
    this.listen();
    return () => {
      set.delete(listener);
      this.closeIfIdle();
    };
  }

  /** Closes the event stream once nobody listens to it. */
  private closeIfIdle(): void {
    const listening = this.listeners.size + this.runListeners.size + this.actionListeners.size;
    if (listening > 0) return;
    this.events?.close();
    this.events = undefined;
  }
}

/** The run going on in `change`, as the server has it; none if it cannot tell. */
async function readRun(change: string): Promise<RunRecord | undefined> {
  const response = await fetch(`/api/changes/${encodeURIComponent(change)}/run`).catch(
    () => undefined,
  );
  if (response === undefined || !response.ok) return undefined;
  const run: unknown = await response.json().catch(() => undefined);
  return isRun(run) ? run : undefined;
}

/** A `run` event: the change, and its run, or nothing when it ended; unreadable, undefined. */
function runEvent(
  data: unknown,
): { readonly change: string; readonly run: RunRecord | undefined } | undefined {
  const told = eventData(data);
  if (!isObject(told) || typeof told.change !== "string") return undefined;
  if (told.run === null) return { change: told.change, run: undefined };
  return isRun(told.run) ? { change: told.change, run: told.run } : undefined;
}

/**
 * An `action` event: the change, the action and the line its command said, without the `specty:`
 * that marks it in the terminal and with a capital; the start and the end bring none. Unreadable,
 * undefined.
 */
function actionEvent(data: unknown): ActionNote | undefined {
  const told = eventData(data);
  if (!isObject(told) || typeof told.change !== "string" || typeof told.action !== "string")
    return undefined;
  const said = typeof told.note === "string" ? told.note.replace(/^specty:\s*/, "").trim() : "";
  const note = `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
  return { change: told.change, action: told.action, ...(note === "" ? {} : { note }) };
}

/** The JSON of an event's data; anything else, undefined. */
function eventData(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}
