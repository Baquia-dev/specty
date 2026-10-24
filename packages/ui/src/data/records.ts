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
import type { ClosingParts } from "./closing";
import type { HistoryEntry } from "./history";
import type { AuditRecord, ProgressView } from "./progress";

/** The data source lives in source.ts; it is exported here too, where the screens look for it. */
export { ActionError, SpectyData } from "./source";
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
  /** The worktree whose files these are, as the local server says it. */
  readonly folder?: string;
}

/** A governed file other open changes also list: their merges may collide. */
export interface SharedFile {
  readonly path: string;
  readonly changes: readonly { readonly id: string; readonly title: string }[];
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

/**
 * Delegated mode (ADR 0010): whether the agent takes the person's decisions, since when and who
 * turned it on, and the warning to read before turning it on, in both languages.
 */
export interface Delegation {
  readonly on: boolean;
  readonly by?: string;
  /** ISO time it was turned on. */
  readonly at?: string;
  readonly warning: Readonly<Record<Lang, readonly string[]>>;
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
  /**
   * The approved revision: which one, when and by whom (`state.approved`). `delegated`: the agent
   * approved it for `by`, who delegated their decisions (ADR 0010).
   */
  readonly approved?: {
    readonly revision: number;
    readonly at: string;
    readonly by: string;
    readonly delegated?: boolean;
  };
  readonly branch?: string;
  /** The folder (worktree) the change lives in, when the source says it. */
  readonly folder?: string;
  /** Governed files that other open changes also list. */
  readonly shared?: readonly SharedFile[];
  readonly phaseSince: string;
  readonly goal: string;
  readonly size?: { readonly level: SizeLevel; readonly reasons: readonly Bilingual[] };
  readonly effort?: { readonly plan: EffortLevel; readonly implement: EffortLevel };
  readonly decision?: DecisionKind;
  /** In review, once the person asked for changes: the agent prepares the next revision. */
  readonly changesRequested?: { readonly revision: number; readonly at: string };
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
  /** The closing the agent wrote (`## Cierre`), in its parts; none until it writes it. */
  readonly closing?: ClosingParts;
  /** What happened, from `audit.jsonl`, oldest first. */
  readonly history: readonly HistoryEntry[];
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
