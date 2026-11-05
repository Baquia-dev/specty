// SPDX-License-Identifier: Apache-2.0
// The data source the screens run on, apart from the data it gives (records.ts, which re-exports
// it): reading is required, every action is optional.
import {
  type ChangeSort,
  type Lang,
  matchesQuery,
  type Phase,
  type SessionView,
  sortChanges,
} from "@baquia-dev/specty-core/light";
import type { ResultDecision } from "./acceptance";
import type { RunRecord } from "./progress";
import type {
  Bilingual,
  ChangeRecord,
  ChangeSummary,
  ChangeView,
  CommentAnchor,
  Delegation,
  MemoryRecord,
} from "./records";
import type { TraceRecord } from "./trace";

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
const NO_TRACE: Bilingual = {
  es: "Esta fuente no da la trazabilidad.",
  en: "This source gives no traceability.",
};

/** A page of the finished changes, as the Inbox asks for it (`GET /api/changes/finished`). */
export interface FinishedRequest {
  readonly offset: number;
  readonly limit: number;
  /** The search, as `matchesQuery` reads it. */
  readonly query: string;
  readonly phase: Phase | "all";
  readonly sort: ChangeSort;
  /** The language the titles are sorted in. */
  readonly lang: Lang;
}

/** The answer to a `FinishedRequest`, as the local server gives it (ARCHITECTURE §15). */
export interface FinishedPage {
  /** The page's changes, each by its summary: its page asks the source for the rest by its id. */
  readonly changes: readonly ChangeSummary[];
  /** How many match the search and the phase. */
  readonly total: number;
  /** How many done and cancelled ones match the search, whatever the phase. */
  readonly counts: { readonly done: number; readonly cancelled: number };
  /** How many finished changes there are, with no search nor phase. */
  readonly finished: number;
}

/** What the person decides on an entry of Specty's memory (ADR 0016). */
export type MemoryVerb = "drop" | "keep" | "done";

/**
 * Any data source the UI can run on: fetch + SSE from the local server, `postMessage` in an
 * editor webview, fixtures in the prototype. Screens depend only on this. Reading is required;
 * actions are optional and fail as read-only unless the source implements them.
 */
export abstract class SpectyData {
  abstract changes(): Promise<readonly ChangeRecord[]>;
  /** Calls `listener` whenever the data may have changed; returns how to stop. */
  abstract subscribe(listener: () => void): () => void;

  /**
   * The change `id`, open or finished, even if `changes` leaves it out; none when there is no
   * such change. A source that gives every change finds it among them.
   */
  async change(id: string): Promise<ChangeRecord | undefined> {
    return (await this.changes()).find((record) => record.state.id === id);
  }

  /**
   * A page of the finished (done or cancelled) changes, each by its summary, found, filtered and
   * sorted as the local server does. A source that gives every change works it out among them,
   * with the views derived in a chunk loaded on first use, so the main thread never loads core's
   * parser for it.
   */
  async finished(request: FinishedRequest): Promise<FinishedPage> {
    const views = (await import("./views")).deriveViews(await this.changes());
    const finished = views.filter((view) => view.phase === "done" || view.phase === "cancelled");
    const found = finished.filter((view) => matchesQuery(view, request.query));
    const shown = found.filter((view) => request.phase === "all" || view.phase === request.phase);
    const page = sortChanges(shown, request.sort, request.lang).slice(
      request.offset,
      request.offset + request.limit,
    );
    const count = (phase: Phase) => found.filter((view) => view.phase === phase).length;
    return {
      changes: page.map(summaryOf),
      total: shown.length,
      counts: { done: count("done"), cancelled: count("cancelled") },
      finished: finished.length,
    };
  }

  /** Why the person cannot decide from this source, or nothing when they can. */
  readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve(READ_ONLY);
  }

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

  editComment(_change: string, _id: string, _body: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  deleteComment(_change: string, _id: string): Promise<void> {
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

  /** Brings back the lost folder of an open change from its branch, as `specty restore`. */
  restoreFolder(_change: string): Promise<void> {
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

  /** The files the change left, for its traceability. */
  traceFiles(_change: string): Promise<readonly string[]> {
    return Promise.reject(new ActionError(NO_TRACE));
  }

  /** `path` as the change left it, in blocks with the commit, change, task and criteria of each. */
  trace(_change: string, _path: string): Promise<TraceRecord> {
    return Promise.reject(new ActionError(NO_TRACE));
  }

  /** Delegated mode as the source knows it; nothing when it cannot tell. */
  delegation(): Promise<Delegation | undefined> {
    return Promise.resolve(undefined);
  }

  /** Specty's memory and who holds each open change (ADR 0016); nothing when it cannot tell. */
  memory(): Promise<MemoryRecord | undefined> {
    return Promise.resolve(undefined);
  }

  /** The agents' sessions in the repository, newest first (ADR 0016); nothing when it cannot tell. */
  sessions(): Promise<readonly SessionView[] | undefined> {
    return Promise.resolve(undefined);
  }

  /** The person's decision on entry `id`: drop it (with its reason), keep it, or mark it done. */
  memoryAction(_id: string, _verb: MemoryVerb, _reason?: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** Turns delegated mode on, once the person read the warning, or off. */
  setDelegation(_on: boolean): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }
}

/** What a list shows of a change: its summary, and nothing else of its view. */
function summaryOf(view: ChangeView): ChangeSummary {
  const { id, title, kind, epic, slices, phase, phaseSince, createdAt, closedAt, size } = view;
  return {
    id,
    title,
    kind,
    ...(epic === undefined ? {} : { epic }),
    ...(slices === undefined ? {} : { slices }),
    phase,
    phaseSince,
    createdAt,
    ...(closedAt === undefined ? {} : { closedAt }),
    ...(size === undefined ? {} : { size }),
    tasks: view.tasks,
    tab: view.tab,
  };
}
