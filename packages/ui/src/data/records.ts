// SPDX-License-Identifier: Apache-2.0
// The data contract of the UI. Only types come from core here: deriving views needs core's parser
// (and zod and yaml), which run in a web worker or a chunk loaded on demand, never in the first load.
import type {
  ChangeKind,
  ChangeState,
  EffortLevel,
  Lang,
  Phase,
  SizeLevel,
} from "@baquia-dev/specty-core";
import type { ResultDecision } from "./acceptance";
import type { AuditRecord, ProgressView, RunRecord } from "./progress";

export { relativeTime } from "./time";

/** What a data source gives for each change: the files as they are, and when its phase began. */
export interface ChangeRecord {
  readonly spec: string;
  readonly state: ChangeState;
  /** ISO time when the change entered its current phase. */
  readonly phaseSince: string;
  /** `comments.json` (formats.md §5); none when absent. */
  readonly comments?: readonly CommentRecord[];
  /** `revisions/r<N>.md` for N = `state.approved.revision`: only when the change was approved. */
  readonly approvedSpec?: string;
  /** `audit.jsonl` (formats.md §4), oldest first; none when absent. */
  readonly audit?: readonly AuditRecord[];
  /** `verify.full` of `config.yaml` (formats.md §6): the project's full verification, if any. */
  readonly verifyFull?: string;
}

/** Where a comment points: an item (`A1`) or a quote inside a section. */
export type CommentAnchor =
  | { readonly item: string }
  | { readonly section: ReviewSection; readonly quote: string };

export interface CommentRecord {
  readonly id: string;
  readonly revision: number;
  readonly anchor: CommentAnchor;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
  readonly resolvedInRevision?: number;
}

export type Bilingual = Readonly<Record<Lang, string>>;

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

  /** Starts the full verification (`verify.full`); it streams through `watchRun`, with no task. */
  verifyChange(_change: string): Promise<void> {
    return Promise.reject(new ActionError(READ_ONLY));
  }

  /** The diff, as `git diff` writes it, of a task or, with none, of the whole change. */
  diff(_change: string, _task?: string): Promise<string> {
    return Promise.reject(
      new ActionError({ es: "Esta fuente no da diffs.", en: "This source gives no diffs." }),
    );
  }
}

export type ReviewSection =
  | "goal"
  | "outOfScope"
  | "assumptions"
  | "criteria"
  | "files"
  | "tasks"
  | "risks"
  | "design";

export interface AssumptionView {
  readonly id: string;
  readonly text: string;
  readonly impact?: "high" | "medium" | "low";
  readonly decision: "pending" | "confirmed" | "rejected" | "implicit";
  readonly comment?: string;
}

export interface CriterionView {
  readonly id: string;
  readonly text: string;
  readonly warnings: readonly Bilingual[];
}

export interface FileView {
  readonly path: string;
  readonly action: "create" | "modify" | "delete" | "rename";
  readonly from?: string;
  readonly reason?: string;
  readonly sensitive: boolean;
}

export interface TaskItemView {
  readonly id: string;
  readonly title: string;
  readonly status: "pending" | "active" | "done";
  readonly ac: readonly string[];
  readonly files: readonly string[];
  readonly warnings: readonly Bilingual[];
}

export interface CommentView extends CommentRecord {
  readonly section: ReviewSection;
  readonly resolved: boolean;
}

export interface SectionIndexView {
  readonly key: ReviewSection;
  readonly present: boolean;
  /** High-impact assumptions still undecided. */
  readonly pending: number;
  readonly comments: number;
  readonly warnings: number;
}

/** A piece of a word diff: unchanged, added or removed. */
export interface DiffPart {
  readonly text: string;
  readonly change?: "added" | "removed";
}

/** A criterion or a file of a task, as a chip, with what happened to it since the approval. */
export interface DeltaChipView {
  readonly label: string;
  readonly kind: "criterion" | "file";
  readonly change?: "added" | "removed";
  /** A file the approved revision did not list: "possible new scope". */
  readonly newScope: boolean;
}

/** One unit that changed since the approved revision: an item, a file or a section of text. */
export interface DeltaEntryView {
  /** An item id (`AC3`), a file path, or the section key of a text (`goal`). */
  readonly key: string;
  readonly kind: "title" | "section" | "assumption" | "criterion" | "task" | "risk" | "file";
  readonly change: "added" | "removed" | "modified";
  readonly section: ReviewSection | "title";
  /** The text now, with the added words marked if modified; the text it had, if removed. */
  readonly text: readonly DiffPart[];
  /** Only when words were removed: the approved text, with the removed words marked. */
  readonly before?: readonly DiffPart[];
  /** A task's criteria and files. */
  readonly chips?: readonly DeltaChipView[];
  /** What changed without text of its own: an assumption's impact, a task's verification… */
  readonly details: readonly Bilingual[];
  /** A new task touching files the approved revision did not list: "possible new scope". */
  readonly newScope: readonly Bilingual[];
}

/** What changed since the person approved (docs/ui.md, "Revisión del delta"). */
export interface DeltaView {
  readonly approvedRevision: number;
  /** In the order of the document. */
  readonly entries: readonly DeltaEntryView[];
}

/** Everything the spec review shows, as plain data. */
export interface ReviewView {
  readonly goal: string;
  readonly outOfScope: string;
  readonly design: string;
  readonly assumptions: readonly AssumptionView[];
  readonly criteria: readonly CriterionView[];
  readonly files: readonly { readonly module: string; readonly files: readonly FileView[] }[];
  readonly tasks: readonly TaskItemView[];
  readonly risks: readonly { readonly id: string; readonly text: string }[];
  /** Unresolved first, then oldest first. */
  readonly comments: readonly CommentView[];
  readonly index: readonly SectionIndexView[];
  /** Validation errors: approving waits for them. */
  readonly errors: readonly Bilingual[];
  /** Only in review, when an earlier revision was approved. */
  readonly delta?: DeltaView;
}

/** What a change waits for from the person, if anything. */
export type DecisionKind = "review" | "scope" | "acceptance" | "closing";

export type ChangeTab = "spec" | "progress" | "acceptance" | "history";

export interface ScopeRequestView {
  readonly id: string;
  readonly task: string;
  readonly paths: readonly string[];
  readonly reason: string;
}

/** A change as the screens show it. Plain data: it crosses from the worker by structured clone. */
export interface ChangeView {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly revision: number;
  /** The approved revision: which one, when and by whom (`state.approved`). */
  readonly approved?: { readonly revision: number; readonly at: string; readonly by: string };
  readonly branch?: string;
  readonly phaseSince: string;
  readonly goal: string;
  readonly size?: { readonly level: SizeLevel; readonly reasons: readonly Bilingual[] };
  readonly effort?: { readonly plan: EffortLevel; readonly implement: EffortLevel };
  readonly decision?: DecisionKind;
  /** High-impact assumptions still undecided: approving waits for them. */
  readonly highImpactPending: number;
  readonly scopeRequests: readonly ScopeRequestView[];
  readonly tasks: { readonly done: number; readonly total: number };
  /** The tab a change opens on, by phase. */
  readonly tab: ChangeTab;
  /** Why the record could not be read in full (invalid state or spec errors). */
  readonly problems: readonly string[];
  readonly review: ReviewView;
  /** The tasks in the spec's order, with their state and last verification. */
  readonly progress: ProgressView;
}

/** Messages to and from the derivation worker. */
export interface DeriveRequest {
  readonly id: number;
  readonly records: readonly ChangeRecord[];
}

export interface DeriveResponse {
  readonly id: number;
  readonly views: readonly ChangeView[];
}
