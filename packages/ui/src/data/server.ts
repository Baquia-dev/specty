// SPDX-License-Identifier: Apache-2.0
import { Injectable, type Type } from "@angular/core";
import type { ResultDecision } from "./acceptance";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "./records";

/** The mark `specty ui` puts in the page it serves (ARCHITECTURE §15). */
const MARK = 'meta[name="specty-data"][content="server"]';

const NO_SESSION: Bilingual = {
  es: "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
  en: "This tab has no session: open the link that `specty ui` prints.",
};
const UNEXPECTED: Bilingual = {
  es: "El servidor devolvió datos inesperados.",
  en: "The server returned unexpected data.",
};
const READ_ONLY: Bilingual = {
  es: "Este servidor es de solo lectura porque lo arrancó el agente: para decidir desde aquí, arráncalo tú con `specty ui` en tu terminal.",
  en: "This server is read only because the agent started it: to decide from here, start it yourself with `specty ui` in your terminal.",
};
const NOT_YET: Bilingual = {
  es: "El servidor local aún no admite esto desde la UI: hazlo en la terminal.",
  en: "The local server does not support this from the UI yet: do it in the terminal.",
};
const NOT_UNDERSTOOD: Bilingual = {
  es: "El servidor no entendió la petición.",
  en: "The server did not understand the request.",
};

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

  override async changes(): Promise<readonly ChangeRecord[]> {
    const response = await fetch("/api/changes");
    if (response.status === 403) throw new ActionError(NO_SESSION);
    if (!response.ok) {
      throw new ActionError({
        es: `El servidor respondió ${response.status}.`,
        en: `The server answered ${response.status}.`,
      });
    }
    const records: unknown = await response.json();
    if (!isRecords(records)) throw new ActionError(UNEXPECTED);
    return records;
  }

  override subscribe(listener: () => void): () => void {
    const events = new EventSource("/api/events");
    events.addEventListener("changes", listener);
    return () => events.close();
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

  override addComment(): Promise<void> {
    return Promise.reject(new ActionError(NOT_YET));
  }

  override requestChanges(): Promise<void> {
    return Promise.reject(new ActionError(NOT_YET));
  }

  override verifyChange(): Promise<void> {
    return Promise.reject(new ActionError(NOT_YET));
  }

  override diff(): Promise<string> {
    return Promise.reject(new ActionError(NOT_YET));
  }

  /** One of the person's actions: done (200) or refused with its reason. */
  private async act(change: string, verb: string, body: object): Promise<void> {
    const { actions, csrf } = await this.serverSession();
    if (!actions || csrf === undefined) throw new ActionError(READ_ONLY);
    const response = await fetch(`/api/changes/${encodeURIComponent(change)}/${verb}`, {
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

/** Why the server refused: the flow's own words (409), or what the status means. */
async function refusal(response: Response): Promise<Bilingual> {
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 409) {
    const said = outputText(body);
    if (said !== undefined) return { es: said, en: said };
  }
  if (response.status === 403) {
    return isObject(body) && body.error === "read-only" ? READ_ONLY : NO_SESSION;
  }
  if (response.status === 400) return NOT_UNDERSTOOD;
  return {
    es: `El servidor respondió ${response.status}.`,
    en: `The server answered ${response.status}.`,
  };
}

/** A command's output as one text: its lines, then its next step, in the repository's language. */
function outputText(body: unknown): string | undefined {
  if (!isObject(body) || !Array.isArray(body.blocks)) return undefined;
  const lines = body.blocks.flatMap((block: unknown) =>
    isObject(block) && Array.isArray(block.lines) ? block.lines.filter(isText) : [],
  );
  const next = typeof body.next === "string" ? body.next : "";
  const step = next === "" ? [] : [`${next.charAt(0).toUpperCase()}${next.slice(1)}`];
  const text = [...lines, ...step].join(" ");
  return text === "" ? undefined : text;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * The data source for this page: the local server's when it served the page, the sample data
 * otherwise. Only the chosen one loads.
 */
export async function dataSource(page: Document): Promise<Type<SpectyData>> {
  if (page.querySelector(MARK) !== null) return ServerData;
  return (await import("./fixtures")).FixtureData;
}

/** A light check of the answer: the worker parses each spec, and each state is Specty's own file. */
function isRecords(value: unknown): value is readonly ChangeRecord[] {
  return Array.isArray(value) && value.every(isRecordLike);
}

function isRecordLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "spec" in value &&
    typeof value.spec === "string" &&
    "state" in value &&
    typeof value.state === "object" &&
    value.state !== null &&
    "phaseSince" in value &&
    typeof value.phaseSince === "string"
  );
}
