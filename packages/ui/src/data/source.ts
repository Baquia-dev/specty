// SPDX-License-Identifier: Apache-2.0
// The data source the screens run on, apart from the data it gives (records.ts, which re-exports
// it): reading is required, every action is optional.
import type { ResultDecision } from "./acceptance";
import type { RunRecord } from "./progress";
import type { Bilingual, ChangeRecord, CommentAnchor, Delegation } from "./records";

/** An action the source could not do, explained in both languages. */
export class ActionError extends Error {
  constructor(readonly text: Bilingual) {
    super(text.en);
  }
}

const READ_ONLY: Bilingual = {
  es: "Esta fuente de datos es de solo lectura: no admite acciones.",
  en: "This data source is read-only: it takes no actions.",
};
const NO_DIFFS: Bilingual = { es: "Esta fuente no da diffs.", en: "This source gives no diffs." };

/**
 * Any data source the UI can run on: fetch + SSE from the local server, `postMessage` in an
 * editor webview, fixtures in the prototype. Screens depend only on this. Reading is required;
 * actions are optional and fail as read-only unless the source implements them.
 */
export abstract class SpectyData {
  abstract changes(): Promise<readonly ChangeRecord[]>;
  /** Calls `listener` whenever the data may have changed; returns how to stop. */
  abstract subscribe(listener: () => void): () => void;

  decideAssumption(
    _change: string,
    _item: string,
    _decision: "confirmed" | "rejected",
    _comment?: string,
  ): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  addComment(_change: string, _anchor: CommentAnchor, _body: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** Sends the unresolved comments to the agent. */
  requestChanges(_change: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** Approves exactly `revision`: if the spec changed meanwhile, the source refuses. */
  approve(_change: string, _revision: number): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /**
   * Follows the verification running in `change`: the listener gets it at once and with each new
   * line, and `undefined` when none runs. A source without live runs simply never has one.
   */
  watchRun(_change: string, listener: (run: RunRecord | undefined) => void): () => void {
    listener(undefined);
    return () => undefined;
  }

  /** Approves or rejects a scope request; a rejection carries the reason the agent reads. */
  decideScope(
    _change: string,
    _request: string,
    _decision: "approved" | "rejected",
    _reason?: string,
  ): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** Accepts the result, or asks for adjustments with the person's literal request. */
  decideResult(_change: string, _decision: ResultDecision): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** Confirms the closing the agent sent, as `specty close`: the change is done. */
  confirmClosing(_change: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** Starts the full verification (`verify.full`); it streams through `watchRun`, with no task. */
  verifyChange(_change: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** The diff, as `git diff` writes it, of a task or, with none, of the whole change. */
  diff(_change: string, _task?: string): Promise<string> {
    return Promise.reject(new ActionError(NO_DIFFS));
  }

  /** Delegated mode as the source knows it; nothing when it cannot tell. */
  delegation(): Promise<Delegation | undefined> {
    return Promise.resolve(undefined);
  }

  /** Turns delegated mode on, once the person read the warning, or off. */
  setDelegation(_on: boolean): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }
}
