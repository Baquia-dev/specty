// SPDX-License-Identifier: Apache-2.0
import { Injectable, type Type } from "@angular/core";
import type { ResultDecision } from "./acceptance";
import type { RunRecord } from "./progress";
import {
  ActionError,
  type ChangeRecord,
  type CommentAnchor,
  type Delegation,
  SpectyData,
} from "./records";
import {
  answered,
  isDelegation,
  isObject,
  isRecords,
  isRun,
  NO_DIFF,
  NO_SESSION,
  READ_ONLY,
  refusal,
  runEvent,
  tooLarge,
  UNEXPECTED,
} from "./server-answers";

/** The mark `specty ui` puts in the page it serves (ARCHITECTURE §15). */
const MARK = 'meta[name="specty-data"][content="server"]';

/** What `GET /api/session` says: whether the person may decide here, and the CSRF token. */
interface ServerSession {
  readonly actions: boolean;
  readonly csrf?: string;
}

type RunListener = (change: string, run: RunRecord | undefined) => void;

/**
 * The local server's data (`specty ui`): the changes of every worktree through `fetch`, read
 * again on each `changes` event, and the person's decisions as POSTs with the CSRF token. Page
 * and API share their origin, so the session cookie goes with every request.
 */
@Injectable()
export class ServerData extends SpectyData {
  private session: Promise<ServerSession> | undefined;
  /** One event stream for every subscriber: the Inbox, delegated mode and the runs alike. */
  private events: EventSource | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly runListeners = new Set<RunListener>();

  override async changes(): Promise<readonly ChangeRecord[]> {
    const response = await fetch("/api/changes");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (!response.ok) throw new ActionError(answered(response.status));
    const records: unknown = await response.json();
    if (!isRecords(records)) throw new ActionError(UNEXPECTED);
    return records;
  }

  override subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.listen();
    return () => {
      this.listeners.delete(listener);
      this.closeIfIdle();
    };
  }

  /**
   * The full verification running in `change`: what it has so far, asked to the server, then
   * every `run` event. An event that arrives before that answer is newer, so it wins.
   */
  override watchRun(change: string, listener: (run: RunRecord | undefined) => void): () => void {
    let heard = false;
    const told: RunListener = (id, run) => {
      if (id !== change) return;
      heard = true;
      listener(run);
    };
    this.runListeners.add(told);
    this.listen();
    void readRun(change).then((run) => {
      if (!heard && this.runListeners.has(told)) listener(run);
    });
    return () => {
      this.runListeners.delete(told);
      this.closeIfIdle();
    };
  }

  override async delegation(): Promise<Delegation> {
    const response = await fetch("/api/delegation");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isDelegation(body)) throw new ActionError(UNEXPECTED);
    return body;
  }

  override setDelegation(on: boolean): Promise<void> {
    return this.post("/api/delegation", { on });
  }

  override approve(change: string, revision: number): Promise<void> {
    return this.act(change, "approve", { revision });
  }

  override decideAssumption(
    change: string,
    item: string,
    decision: "confirmed" | "rejected",
    comment?: string,
  ): Promise<void> {
    const body = { decision, ...(comment === undefined ? {} : { comment }) };
    return this.act(change, `assumptions/${encodeURIComponent(item)}`, body);
  }

  override decideScope(
    change: string,
    request: string,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    const body = { decision, ...(reason === undefined ? {} : { reason }) };
    return this.act(change, `scope/${encodeURIComponent(request)}`, body);
  }

  override decideResult(change: string, decision: ResultDecision): Promise<void> {
    return decision.kind === "accept"
      ? this.act(change, "accept", {})
      : this.act(change, "adjust", { request: decision.request });
  }

  override confirmClosing(change: string): Promise<void> {
    return this.act(change, "close", {});
  }

  override addComment(change: string, anchor: CommentAnchor, body: string): Promise<void> {
    return this.act(change, "comments", { anchor, body });
  }

  override requestChanges(change: string): Promise<void> {
    return this.act(change, "request-changes", {});
  }

  /** Starts it in the server: it answers once it runs, and the output comes through `watchRun`. */
  override verifyChange(change: string): Promise<void> {
    return this.act(change, "verify", {});
  }

  /** The diff of a task or of the whole change; it is read, so even an agent's server gives it. */
  override async diff(change: string, task?: string): Promise<string> {
    const query = task === undefined ? "" : `?task=${encodeURIComponent(task)}`;
    const response = await fetch(`/api/changes/${encodeURIComponent(change)}/diff${query}`);
    if (response.ok) return response.text();
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (response.status === 404) throw new ActionError(NO_DIFF);
    if (response.status === 413) {
      const body: unknown = await response.json().catch(() => undefined);
      throw new ActionError(tooLarge(isObject(body) ? body.range : undefined));
    }
    throw new ActionError(answered(response.status));
  }

  /** Opens the event stream, once, for everyone who listens to it. */
  private listen(): void {
    if (this.events !== undefined) return;
    this.events = new EventSource("/api/events");
    this.events.addEventListener("changes", () => {
      for (const heard of this.listeners) heard();
    });
    this.events.addEventListener("run", (event: MessageEvent) => {
      const told = runEvent(event.data);
      if (told === undefined) return;
      for (const heard of this.runListeners) heard(told.change, told.run);
    });
  }

  /** Closes the event stream once nobody listens to it. */
  private closeIfIdle(): void {
    if (this.listeners.size > 0 || this.runListeners.size > 0) return;
    this.events?.close();
    this.events = undefined;
  }

  /** One of the person's actions on a change. */
  private act(change: string, verb: string, body: object): Promise<void> {
    return this.post(`/api/changes/${encodeURIComponent(change)}/${verb}`, body);
  }

  /** A decision of the person: done (200) or refused with its reason. */
  private async post(path: string, body: object): Promise<void> {
    const { actions, csrf } = await this.serverSession();
    if (!actions || csrf === undefined) throw new ActionError(READ_ONLY);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Specty-CSRF": csrf },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new ActionError(await refusal(response));
  }

  /** The server's session, asked once; a failed ask is asked again next time. */
  private serverSession(): Promise<ServerSession> {
    this.session ??= readSession().catch((error: unknown) => {
      this.session = undefined;
      throw error;
    });
    return this.session;
  }
}

async function readSession(): Promise<ServerSession> {
  const response = await fetch("/api/session");
  if (response.status === 403) throw new ActionError(NO_SESSION);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isObject(body) || typeof body.actions !== "boolean")
    throw new ActionError(UNEXPECTED);
  return { actions: body.actions, ...(typeof body.csrf === "string" ? { csrf: body.csrf } : {}) };
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

/**
 * The data source for this page: the local server's when it served the page, the sample data
 * otherwise. Only the chosen one loads.
 */
export async function dataSource(page: Document): Promise<Type<SpectyData>> {
  if (page.querySelector(MARK) !== null) return ServerData;
  return (await import("./fixtures")).FixtureData;
}
