// SPDX-License-Identifier: Apache-2.0
import type { AgentTool } from "../agents";
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import type { EffortLevel } from "../sizing/effort";
import type { ChangeKind } from "../spec/model";

/** What the cards need to know about the environment. */
export interface CardContext {
  readonly lang: Lang;
  /** How instructions call Specty, usually `specty`. */
  readonly command: string;
  readonly tool?: AgentTool;
  readonly quickMaxFiles: number;
  readonly implicitTests: boolean;
}

export interface CriterionView {
  readonly id: string;
  readonly text: string;
}

export interface TaskView {
  readonly id: string;
  readonly title: string;
  readonly status: "pending" | "active" | "done";
  readonly files: readonly string[];
  /** Approved scope extensions. */
  readonly extras: readonly string[];
  readonly criteria: readonly CriterionView[];
  readonly verify?: string;
  readonly summary?: string;
  /** Short SHA of the task's commit, when known. */
  readonly commit?: string;
  readonly effort: EffortLevel;
}

export interface ScopeRequestView {
  readonly id: string;
  readonly task: string;
  readonly paths: readonly string[];
  readonly reason: string;
}

export interface RejectedView {
  readonly id: string;
  readonly text: string;
  readonly comment?: string;
}

export interface ChangeView {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly title: string;
  /** Repository-relative path of `spec.md`. */
  readonly specPath: string;
  readonly branch?: string;
  readonly revision: number;
  readonly tasks: readonly TaskView[];
  /** Nested AGENTS.md files that apply to the active task's files. */
  readonly conventions: readonly string[];
  readonly pendingScope: readonly ScopeRequestView[];
  readonly rejected: readonly RejectedView[];
  /** The user's literal adjustment request, while adjusting. */
  readonly adjustment?: string;
  readonly closingSubmitted: boolean;
  /** `spec.md` no longer matches the approved revision. */
  readonly specChanged: boolean;
}
