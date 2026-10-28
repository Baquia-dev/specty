// SPDX-License-Identifier: Apache-2.0
import type { AgentTool } from "../agents";
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import type { AssertionLoss } from "../scope/assertions";
import type { RiskFinding } from "../scope/risk";
import type { EffortLevel } from "../sizing/effort";
import type { LongFile } from "../sizing/lines";
import type { ChangeKind } from "../spec/model";
import type { TestRules } from "../validate/quality";

/** What the cards need to know about the environment. */
export interface CardContext {
  readonly lang: Lang;
  /** How instructions call Specty, usually `specty`. */
  readonly command: string;
  readonly tool?: AgentTool;
  readonly quickMaxFiles: number;
  readonly implicitTests: boolean;
  /** `git.flow` names the branches by the change's type, so `new` takes `--type`. */
  readonly branchTypes?: boolean;
  /** The person delegated their decisions to the agent (ADR 0010): the agent runs them itself. */
  readonly delegated?: boolean;
}

export interface CriterionView {
  readonly id: string;
  readonly text: string;
}

/** A line of a test that carries a criterion's id, and the task whose commit added it. */
interface CriterionTestView {
  readonly path: string;
  readonly line: number;
  readonly task: string;
  /** Short SHA of the commit that added the line. */
  readonly commit: string;
}

/** A criterion in acceptance, with the tests that carry its id (ADR 0014). */
export interface CriterionTestsView {
  readonly id: string;
  /** `test: manual`: the person checks it by hand. */
  readonly manual: boolean;
  /** A `feat` or `fix` task covers it, so a test should carry its id. */
  readonly owed: boolean;
  readonly tests: readonly CriterionTestView[];
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
  /** What the card asks about tests, by the task's type and the tests policy. */
  readonly testRules?: TestRules;
  /** Assertions the task removed from tests that existed at its base commit. */
  readonly removedAssertions?: readonly AssertionLoss[];
  /** Known risky content the task added, from its diff. */
  readonly risks?: readonly RiskFinding[];
  /** What the agent learned in the task (`task done --finding`), for the tasks and changes after. */
  readonly findings?: readonly string[];
  /** Files the task left past the warning line of lines of code. */
  readonly longFiles?: readonly LongFile[];
}

/** What a change this one follows (`follows`) left for it: its follow-ups and its findings. */
export interface CarriedView {
  readonly id: string;
  /** False when the change is not in this folder, for example open in another worktree. */
  readonly found: boolean;
  readonly pending: readonly string[];
  readonly findings: readonly { readonly task: string; readonly text: string }[];
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

/** A person's comment on the spec (formats.md §5): on an item, or on a quote of a section. */
export interface CommentView {
  readonly id: string;
  readonly anchor: { readonly item: string } | { readonly section: string; readonly quote: string };
  readonly body: string;
}

/** An incorporation of the main branch that waits for the agent in the change's folder. */
export interface IntegrationView {
  readonly target: string;
  /** The merge conflicts, or the verification fails on its result. */
  readonly reason: "conflicts" | "verify";
  readonly conflicts: readonly string[];
  /** The files the agent may touch to finish it. */
  readonly paths: readonly string[];
}

/** A slice of an epic, with the change that implements it, if there is one. */
export interface SliceView {
  readonly id: string;
  readonly title: string;
  readonly depends: readonly string[];
  /** Closed; in progress; ready, with every slice it depends on closed; or waiting for them. */
  readonly status: "done" | "open" | "ready" | "waiting";
  /** The slice's change: the closed one, or the one in progress, with its folder. */
  readonly child?: { readonly id: string; readonly phase: Phase; readonly folder?: string };
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
  /** The unresolved comments, once the person asked for changes after the last proposal. */
  readonly requested?: readonly CommentView[];
  /** The user's literal adjustment request, while adjusting. */
  readonly adjustment?: string;
  /** The user's literal request the change was created for (`new --request`), while drafting. */
  readonly request?: string;
  /** While drafting, what each change in `follows` left for this one. */
  readonly carried?: readonly CarriedView[];
  /** In acceptance, an independent review of the result (ADR 0011) should come first. */
  readonly recommendReview?: boolean;
  /** In acceptance, each criterion of the spec with the tests that carry its id. */
  readonly criteriaTests?: readonly CriterionTestsView[];
  readonly closingSubmitted: boolean;
  /** In the testing phase, the tests were sent and wait for the person (ADR 0014). */
  readonly testsSubmitted?: boolean;
  /** `spec.md` no longer matches the approved revision. */
  readonly specChanged: boolean;
  /** Only while an incorporation is pending: it comes before the phase's work. */
  readonly integration?: IntegrationView;
  /** An epic's slices, in the order of its spec. */
  readonly slices?: readonly SliceView[];
}
