// SPDX-License-Identifier: Apache-2.0
// What a list shows of a change, from its files: the UI derives its views with it and the local
// server its pages of finished changes, so a row reads the same whichever source gave it.
import type { Phase } from "./flow/phases";
import type { Lang } from "./i18n";
import { DEFAULT_CONFIG } from "./schema/config";
import type { ChangeState } from "./schema/state";
import { computeSize, formatSizeReason, type SizeLevel } from "./sizing/size";
import type { ChangeKind, Spec } from "./spec/model";

/** The tab a change's page opens on. */
export type ChangeTab = "spec" | "progress" | "acceptance" | "history";

const TABS: Readonly<Record<Phase, ChangeTab>> = {
  draft: "spec",
  review: "spec",
  testing: "progress",
  implementing: "progress",
  adjusting: "progress",
  acceptance: "acceptance",
  closing: "acceptance",
  done: "history",
  cancelled: "history",
};

/** The audit entries that finish a change: the last one says when it finished. */
const FINISH_EVENTS: readonly unknown[] = [
  "change.closed",
  "change.cancelled",
  "retro.confirmed",
  "change.accepted",
];

/** What a change is summarized from: its spec, already parsed, its state and its audit. */
export interface SummarySource {
  readonly spec: Spec;
  readonly state: ChangeState;
  /** ISO time when the change entered its current phase. */
  readonly phaseSince: string;
  /** The lines of `audit.jsonl` (formats.md §4), oldest first, as JSON read them. */
  readonly audit: readonly unknown[];
}

/** A change as a list shows it; the list gives its epic's title, which only the epic knows. */
export interface ChangeSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  /** The epic it implements a slice of (`frontmatter.epic` and `frontmatter.slice`). */
  readonly epic?: { readonly id: string; readonly slice?: string };
  /** An epic's slices, from its Cortes section: the id and the title of each. */
  readonly slices?: readonly { readonly id: string; readonly title: string }[];
  readonly phase: Phase;
  readonly phaseSince: string;
  /** ISO time it was created. */
  readonly createdAt: string;
  /** ISO time it finished: only a done or cancelled change has one. */
  readonly closedAt?: string;
  readonly size: {
    readonly level: SizeLevel;
    readonly reasons: readonly Readonly<Record<Lang, string>>[];
  };
  readonly tasks: { readonly done: number; readonly total: number };
  readonly tab: ChangeTab;
}

/** A line of the audit with its time, and the event it says, if any. */
interface Line {
  readonly ts: string;
  readonly event: unknown;
}

/** The tab a change's page opens on, by its phase. */
export function initialTab(phase: Phase): ChangeTab {
  return TABS[phase];
}

/** The summary of a change: what the Inbox's row and an epic's header read of it. */
export function summarizeChange({ spec, state, phaseSince, audit }: SummarySource): ChangeSummary {
  const size = computeSize(spec, DEFAULT_CONFIG);
  const tasks = spec.sections.tasks?.items ?? [];
  const slices = spec.sections.slices?.items ?? [];
  const { epic, slice } = spec.frontmatter;
  return {
    id: state.id,
    title: spec.title || state.id,
    kind: state.kind,
    ...(epic === undefined
      ? {}
      : { epic: { id: epic, ...(slice === undefined ? {} : { slice }) } }),
    ...(slices.length === 0 ? {} : { slices: slices.map(({ id, title }) => ({ id, title })) }),
    phase: state.phase,
    phaseSince,
    ...timesOf(state.phase, phaseSince, linesOf(audit)),
    size: {
      level: state.size?.level ?? size.level,
      reasons: size.reasons.map((reason) => ({
        es: formatSizeReason(reason, "es"),
        en: formatSizeReason(reason, "en"),
      })),
    },
    tasks: {
      done: tasks.filter((task) => state.tasks[task.id]?.status === "done").length,
      total: tasks.length,
    },
    tab: initialTab(state.phase),
  };
}

/**
 * When the change began, at its `change.created` or else at its first line, and, if it is done or
 * cancelled, when it finished, at the last entry that finished it; without them, at `phaseSince`.
 */
function timesOf(
  phase: Phase,
  phaseSince: string,
  lines: readonly Line[],
): Pick<ChangeSummary, "createdAt" | "closedAt"> {
  const createdAt =
    lines.find((line) => line.event === "change.created")?.ts ?? lines[0]?.ts ?? phaseSince;
  if (phase !== "done" && phase !== "cancelled") return { createdAt };
  const closedAt = lines.findLast((line) => FINISH_EVENTS.includes(line.event))?.ts ?? phaseSince;
  return { createdAt, closedAt };
}

/** The lines of the audit that say when they happened. */
function linesOf(audit: readonly unknown[]): readonly Line[] {
  return audit.flatMap((entry) =>
    typeof entry === "object" && entry !== null && "ts" in entry && typeof entry.ts === "string"
      ? [{ ts: entry.ts, event: "event" in entry ? entry.event : undefined }]
      : [],
  );
}
