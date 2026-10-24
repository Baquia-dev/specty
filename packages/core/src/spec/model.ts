// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

export type ChangeKind = "quick" | "standard" | "spike" | "retro" | "epic";

export const CHANGE_KINDS: readonly ChangeKind[] = ["quick", "standard", "spike", "retro", "epic"];

export type ProseSectionKey = "goal" | "question" | "reason" | "outOfScope" | "design" | "closing";
export type ListSectionKey = "assumptions" | "criteria" | "files" | "tasks" | "slices" | "risks";
export type SectionKey = ProseSectionKey | ListSectionKey;

/** Canonical order of sections in a serialized spec. */
export const SECTION_ORDER: readonly SectionKey[] = [
  "goal",
  "question",
  "reason",
  "outOfScope",
  "assumptions",
  "criteria",
  "design",
  "files",
  "tasks",
  "slices",
  "risks",
  "closing",
];

const PROSE_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>([
  "goal",
  "question",
  "reason",
  "outOfScope",
  "design",
  "closing",
]);

export function isProseSection(key: SectionKey): key is ProseSectionKey {
  return PROSE_SECTIONS.has(key);
}

export type Impact = "high" | "medium" | "low";
export type FileAction = "create" | "modify" | "delete" | "rename";
export type CommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "perf"
  | "test"
  | "docs"
  | "chore"
  | "build"
  | "ci"
  | "style";

export const COMMIT_TYPES: readonly CommitType[] = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "chore",
  "build",
  "ci",
  "style",
];

/** Neutral effort levels; the CLI maps them to each tool's settings. */
export const EFFORT_LEVELS = ["low", "medium", "high", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/** The model's effort for one task, which can only raise Specty's: `effort: high — reason`. */
export interface TaskEffort {
  readonly level: EffortLevel;
  readonly reason?: string;
}

/** The model's effort for reviewing the spec and the scope, which can only raise Specty's. */
export interface ReviewEffort {
  readonly review: EffortLevel;
  readonly reason: string;
}

export interface Assumption {
  readonly id: string;
  readonly text: string;
  readonly impact?: Impact;
}

export interface Criterion {
  readonly id: string;
  readonly text: string;
}

export interface Risk {
  readonly id: string;
  readonly text: string;
}

/** A path the change touches. For renames, `from` is the old path and `path` the new one. */
export interface FileEntry {
  readonly action: FileAction;
  readonly path: string;
  readonly from?: string;
  readonly reason?: string;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
  readonly files: readonly string[];
  /** Criteria the task covers; `"none"` is written `ac: —`. */
  readonly ac?: readonly string[] | "none";
  readonly verify?: string;
  readonly type?: CommitType;
  readonly notes?: string;
  readonly effort?: TaskEffort;
}

export interface Slice {
  readonly id: string;
  readonly title: string;
  readonly ac: readonly string[];
  readonly depends: readonly string[];
}

/** A list section. `none` is an explicit "- Ninguno" / "- None". */
export interface ItemList<T> {
  readonly none: boolean;
  readonly items: readonly T[];
}

export interface Estimate {
  readonly adjust: -1 | 0 | 1;
  readonly reason: string;
}

export interface Frontmatter {
  readonly kind: ChangeKind;
  readonly epic?: string;
  readonly slice?: string;
  readonly follows: readonly string[];
  readonly dependsOn: readonly string[];
  readonly timebox?: string;
  readonly estimate?: Estimate;
  readonly effort?: ReviewEffort;
}

export interface SpecSections {
  readonly goal?: string;
  readonly question?: string;
  readonly reason?: string;
  readonly outOfScope?: string;
  readonly assumptions?: ItemList<Assumption>;
  readonly criteria?: ItemList<Criterion>;
  readonly design?: string;
  readonly files?: ItemList<FileEntry>;
  readonly tasks?: ItemList<Task>;
  readonly slices?: ItemList<Slice>;
  readonly risks?: ItemList<Risk>;
  readonly closing?: string;
}

export interface Spec {
  readonly language: Lang;
  readonly frontmatter: Frontmatter;
  readonly title: string;
  readonly sections: SpecSections;
}

/** Source line numbers (1-based) of the parsed pieces, for diagnostics. */
export interface SpecLocations {
  readonly frontmatter?: number;
  readonly title?: number;
  readonly sections: Readonly<Partial<Record<SectionKey, number>>>;
  readonly items: Readonly<Record<string, number>>;
  readonly files: Readonly<Record<string, number>>;
}
