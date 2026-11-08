// SPDX-License-Identifier: Apache-2.0
import { Injectable, type Type } from "@angular/core";
import type { StatsChangesPage, StatsView } from "@baquia-dev/specty-core";
import type { ConfigEdit, SessionView } from "@baquia-dev/specty-core/light";
import type { ResultDecision } from "./acceptance";
import type { Download } from "./export";
import type { RunRecord } from "./progress";
import {
  ActionError,
  type Bilingual,
  type ChangeRecord,
  type CommentAnchor,
  type Delegation,
  type MemoryRecord,
  type SliceChangeRecord,
  SpectyData,
  type SpectySwitch,
} from "./records";
import {
  answered,
  configReason,
  configRefusal,
  isChangeRecord,
  isConfigCheck,
  isConfigRecord,
  isConfigSaved,
  isDelegation,
  isFinishedPage,
  isMemoryRecord,
  isObject,
  isRecords,
  isSessionList,
  isSliceChanges,
  isSpectySwitch,
  NO_DIFF,
  NO_SESSION,
  READ_ONLY,
  refusal,
  tooLarge,
  UNEXPECTED,
} from "./server-answers";
import { ServerEvents } from "./server-events";
import {
  fetchStats,
  fetchStatsChanges,
  fetchStatsExport,
  type StatsExportParams,
} from "./server-stats";
import { fetchTestCode, fetchTrace, fetchTraceFiles } from "./server-trace";
import type {
  ActionNote,
  ConfigCheck,
  ConfigRecord,
  ConfigSaved,
  FinishedPage,
  FinishedRequest,
  MemoryVerb,
  StatsChangesParams,
  StatsParams,
} from "./source";
import type { TraceRecord } from "./trace";

/** The mark `specty ui` puts in the page it serves (ARCHITECTURE §15). */
const MARK = 'meta[name="specty-data"][content="server"]';

/** What `GET /api/session` says: whether the person may decide here, and the CSRF token. */
interface ServerSession {
  readonly actions: boolean;
  readonly csrf?: string;
}

/**
 * The local server's data (`specty ui`): the changes of every worktree through `fetch`, read
 * again on each `changes` event, and the person's decisions as POSTs with the CSRF token. Page
 * and API share their origin, so the session cookie goes with every request.
 */
@Injectable()
export class ServerData extends SpectyData {
  private session: Promise<ServerSession> | undefined;
  /** One event stream for every subscriber: the Inbox, delegated mode, the runs and the actions. */
  private readonly events = new ServerEvents();

  override async changes(): Promise<readonly ChangeRecord[]> {
    const response = await fetch("/api/changes");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (!response.ok) throw new ActionError(answered(response.status));
    const records: unknown = await response.json();
    if (!isRecords(records)) throw new ActionError(UNEXPECTED);
    return records;
  }

  /** One change by its id, open or finished; none when the server does not know it (404). */
  override async change(id: string): Promise<ChangeRecord | undefined> {
    const response = await fetch(`/api/changes/${encodeURIComponent(id)}`);
    if (response.status === 404) return undefined;
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (!response.ok) throw new ActionError(answered(response.status));
    const record: unknown = await response.json();
    if (!isChangeRecord(record)) throw new ActionError(UNEXPECTED);
    return record;
  }

  /** A page of the finished changes, found, filtered and sorted by the server. */
  override async finished(request: FinishedRequest): Promise<FinishedPage> {
    const query = new URLSearchParams({
      offset: String(request.offset),
      limit: String(request.limit),
      q: request.query,
      phase: request.phase,
      sort: request.sort,
      lang: request.lang,
    });
    const response = await fetch(`/api/changes/finished?${query}`);
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (!response.ok) throw new ActionError(answered(response.status));
    const page: unknown = await response.json().catch(() => undefined);
    if (!isFinishedPage(page)) throw new ActionError(UNEXPECTED);
    return page;
  }

  /** A page of the panel's table of changes, found, sorted and cut by the server. */
  override statsChanges(params: StatsChangesParams): Promise<StatsChangesPage> {
    return fetchStatsChanges(params);
  }

  /** The panel's changes of the cut as the file the server writes. */
  override statsExport(params: StatsExportParams): Promise<Download> {
    return fetchStatsExport(params);
  }

  override subscribe(listener: () => unknown): () => void {
    return this.events.subscribe(listener);
  }

  /** What `/run` says of the verification running in `change`, then every `run` event. */
  override watchRun(change: string, listener: (run: RunRecord | undefined) => void): () => void {
    return this.events.watchRun(change, listener);
  }

  /** Every `action` event: what the server says of the person's actions as they go on. */
  override watchActions(listener: (told: ActionNote) => void): () => void {
    return this.events.watchActions(listener);
  }

  /** Read only when the agent started the server; without a session, why it has none. */
  override async readOnly(): Promise<Bilingual | undefined> {
    try {
      const { actions, csrf } = await this.serverSession();
      return actions && csrf !== undefined ? undefined : READ_ONLY;
    } catch (error) {
      return error instanceof ActionError ? error.text : UNEXPECTED;
    }
  }

  /** The change of each slice of the epic, as the server picks it among every change. */
  override async sliceChanges(epic: string): Promise<readonly SliceChangeRecord[]> {
    const response = await fetch(`/api/changes/${encodeURIComponent(epic)}/slices`);
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (!response.ok) throw new ActionError(answered(response.status));
    const body: unknown = await response.json().catch(() => undefined);
    if (!isSliceChanges(body)) throw new ActionError(UNEXPECTED);
    return body;
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

  override async specty(): Promise<SpectySwitch> {
    const response = await fetch("/api/switch");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isSpectySwitch(body)) throw new ActionError(UNEXPECTED);
    return body;
  }

  override setSpecty(on: boolean): Promise<void> {
    return this.post("/api/switch", { on });
  }

  override memoryAction(id: string, verb: MemoryVerb, reason?: string): Promise<void> {
    const body = reason === undefined ? {} : { reason };
    return this.post(`/api/memory/${encodeURIComponent(id)}/${verb}`, body);
  }

  override async sessions(): Promise<readonly SessionView[]> {
    const response = await fetch("/api/sessions");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isSessionList(body)) throw new ActionError(UNEXPECTED);
    return body;
  }

  /** The panel of the cut, with only the parameters the page's URL has. */
  override stats(params: StatsParams): Promise<StatsView> {
    return fetchStats(params);
  }

  /** The configuration, with why it cannot be saved now in words. */
  override async config(): Promise<ConfigRecord> {
    const response = await fetch("/api/config");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isConfigRecord(body)) throw new ActionError(UNEXPECTED);
    const { blocked, ...record } = body;
    if (blocked === undefined) return record;
    return { ...record, blocked: configReason(blocked.kind, blocked) ?? UNEXPECTED };
  }

  /** What the person's edits would leave: the server checks them and writes nothing. */
  override async checkConfig(edits: readonly ConfigEdit[]): Promise<ConfigCheck> {
    const response = await this.send("/api/config/check", { edits });
    if (!response.ok) throw new ActionError(await refusal(response));
    const body: unknown = await response.json().catch(() => undefined);
    if (!isConfigCheck(body)) throw new ActionError(UNEXPECTED);
    return body;
  }

  /** The person's edits saved in a commit of their own, read again as after any decision. */
  override async saveConfig(edits: readonly ConfigEdit[]): Promise<ConfigSaved> {
    const response = await this.send("/api/config", { edits });
    if (response.status === 409) throw new ActionError(await configRefusal(response));
    if (!response.ok) throw new ActionError(await refusal(response));
    const body: unknown = await response.json().catch(() => undefined);
    if (!isConfigSaved(body)) throw new ActionError(UNEXPECTED);
    await this.events.reread();
    return body;
  }

  override async memory(): Promise<MemoryRecord> {
    const response = await fetch("/api/memory");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isMemoryRecord(body)) throw new ActionError(UNEXPECTED);
    return body;
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

  override editComment(change: string, id: string, body: string): Promise<void> {
    return this.act(change, `comments/${encodeURIComponent(id)}`, { body });
  }

  override deleteComment(change: string, id: string): Promise<void> {
    return this.act(change, `comments/${encodeURIComponent(id)}`, { delete: true });
  }

  override requestChanges(change: string): Promise<void> {
    return this.act(change, "request-changes", {});
  }

  /** Starts it in the server: it answers once it runs, and the output comes through `watchRun`. */
  override verifyChange(change: string): Promise<void> {
    return this.act(change, "verify", {});
  }

  override restoreFolder(change: string): Promise<void> {
    return this.act(change, "restore", {});
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

  /** The files the change left; a read, so even an agent's server gives them. */
  override traceFiles(change: string): Promise<readonly string[]> {
    return fetchTraceFiles(change);
  }

  /** `path` as the change left it, in blocks with what `specty why` tells of each. */
  override trace(change: string, path: string): Promise<TraceRecord> {
    return fetchTrace(change, path);
  }

  /** A test of the change as its branch has it; a read, so even an agent's server gives it. */
  override testCode(change: string, path: string): Promise<string> {
    return fetchTestCode(change, path);
  }

  /** One of the person's actions on a change. */
  private act(change: string, verb: string, body: object): Promise<void> {
    return this.post(`/api/changes/${encodeURIComponent(change)}/${verb}`, body);
  }

  /**
   * A decision of the person: refused with its reason, or done (200) once the screens show it,
   * read again as on a `changes` event.
   */
  private async post(path: string, body: object): Promise<void> {
    const response = await this.send(path, body);
    if (!response.ok) throw new ActionError(await refusal(response));
    await this.events.reread();
  }

  /** A request of the person's, with the CSRF token; refused as read only where they cannot decide. */
  private async send(path: string, body: object): Promise<Response> {
    const { actions, csrf } = await this.serverSession();
    if (!actions || csrf === undefined) throw new ActionError(READ_ONLY);
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Specty-CSRF": csrf },
      body: JSON.stringify(body),
    });
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

/**
 * The data source for this page: the local server's when it served the page, the sample data
 * otherwise. Only the chosen one loads.
 */
export async function dataSource(page: Document): Promise<Type<SpectyData>> {
  if (page.querySelector(MARK) !== null) return ServerData;
  return (await import("./fixtures")).FixtureData;
}
