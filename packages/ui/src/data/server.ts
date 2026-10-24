// SPDX-License-Identifier: Apache-2.0
import { Injectable, type Type } from "@angular/core";
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

/**
 * The local server's data (`specty ui`): the changes of every worktree through `fetch`, read
 * again on each `changes` event. Page and API share their origin, so the session cookie goes
 * with every request. The server only reads for now: every action stays read-only.
 */
@Injectable()
export class ServerData extends SpectyData {
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
