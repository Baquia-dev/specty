// SPDX-License-Identifier: Apache-2.0
// The lines of an epic's card in the Inbox: one per slice of its Cortes section, in its order,
// with the change that implements it and where it stands across the phases. Pure.
import type { Phase } from "@baquia-dev/specty-core/light";
import {
  type Bilingual,
  type ChangeTab,
  type DecisionKind,
  isWhole,
  type ListedChange,
  type SliceChangeRecord,
} from "../data/records";
import { loadedSliceChanges } from "../data/slice-changes";
import { type LaneHolds, laneHolds, saysSomething } from "./lane-holds";

/** The headers of a line's four stretches. */
export const LANE_STEPS: readonly Bilingual[] = [
  { es: "Spec", en: "Spec" },
  { es: "Tests", en: "Tests" },
  { es: "Impl.", en: "Impl." },
  { es: "Acept.", en: "Accept." },
];

/** The stretch of each phase; a finished change fills the four. */
const STEP_OF: Readonly<Record<Phase, number>> = {
  draft: 0,
  review: 0,
  testing: 1,
  implementing: 2,
  adjusting: 2,
  acceptance: 3,
  closing: 3,
  done: 4,
  cancelled: 0,
};

/**
 * What the source said of the change of each slice: nothing yet, or it failed (`waiting`); that
 * it cannot tell, so the changes loaded are all there are (`untold`); or each slice's change.
 */
export type SliceAnswer =
  | { readonly kind: "waiting" }
  | { readonly kind: "untold" }
  | { readonly kind: "given"; readonly changes: readonly SliceChangeRecord[] };

/** Where a slice stands. */
export type LaneState =
  /** Its change is not known: the source has not answered. */
  | { readonly kind: "unknown" }
  /** It has no change yet: the slices it waits for, and whether the epic waits for approval. */
  | {
      readonly kind: "planned";
      readonly waitsFor: readonly string[];
      readonly beforeApproval: boolean;
    }
  /** Its change is open: its phase and, when it waits for the person, the decision. */
  | { readonly kind: "open"; readonly phase: Phase; readonly decision?: DecisionKind }
  | { readonly kind: "done" };

/** A stretch of a line's track. */
export type LaneCell = "empty" | "past" | "current" | "done";

/** A line of an epic's card. */
export interface EpicLane {
  /** Its key in the card: the slice's id or, for a change of a slice the Cortes do not name, its id. */
  readonly key: string;
  /** The slice's id, «C2»; empty for a change of the epic without one. */
  readonly slice: string;
  readonly title: string;
  /** The change it links to, with the tab it opens on when it is loaded. */
  readonly change?: { readonly id: string; readonly tab?: ChangeTab };
  readonly state: LaneState;
  /**
   * Who holds its change and what it warns of: only a line whose change is open and loaded, and
   * when there is something to say.
   */
  readonly holds?: LaneHolds;
}

/** A slice as its line reads it. */
interface Slice {
  readonly id: string;
  readonly title: string;
  readonly depends: readonly string[];
}

/** The change of a line: loaded, or only as the source gives it. */
type Implementer = ListedChange | SliceChangeRecord;

/** Whether an epic's card asks the source for its slices' changes: while they may start or run. */
export function asksForSlices(phase: Phase): boolean {
  return (
    phase === "draft" || phase === "review" || phase === "implementing" || phase === "adjusting"
  );
}

/**
 * The lines of `epic`'s card: each slice of its Cortes section, in its order, and then each change
 * of the epic among `loaded`, not cancelled, whose slice the section does not name. In acceptance,
 * closing or done, every slice is finished; otherwise each one stands where its change does, and a
 * slice without one has not started, unless the source has not said so yet (`answer`). A line
 * whose change is open and loaded says who holds it and what it warns of, if anything (`laneHolds`).
 */
export function epicLanes(
  epic: ListedChange,
  loaded: readonly ListedChange[],
  answer: SliceAnswer,
): readonly EpicLane[] {
  const slices = slicesOf(epic);
  const changeOf = picker(epic, loaded, answer);
  const settled = epic.phase === "acceptance" || epic.phase === "closing" || epic.phase === "done";
  const finished = new Set(
    slices.filter((slice) => settled || changeOf(slice.id)?.phase === "done").map(({ id }) => id),
  );
  const plan = (slice: Slice): LaneState =>
    asksForSlices(epic.phase) && answer.kind !== "waiting"
      ? {
          kind: "planned",
          waitsFor: slice.depends.filter((id) => !finished.has(id)),
          beforeApproval: epic.phase === "draft" || epic.phase === "review",
        }
      : { kind: "unknown" };
  const named = slices.map((slice): EpicLane => {
    const change = changeOf(slice.id);
    const state: LaneState = settled
      ? { kind: "done" }
      : change === undefined
        ? plan(slice)
        : stateOf(change);
    return { key: slice.id, slice: slice.id, title: slice.title, ...linkOf(change), state };
  });
  return [...named, ...strays(epic.id, loaded, slices)].map((lane) => {
    const holds = laneHolds(lane.change?.id, loaded);
    return holds !== undefined && saysSomething(holds) ? { ...lane, holds } : lane;
  });
}

/** The four stretches of a line's track: passed, its phase's, empty or finished. */
export function laneCells(state: LaneState): readonly LaneCell[] {
  if (state.kind === "done") return LANE_STEPS.map((): LaneCell => "done");
  if (state.kind !== "open") return LANE_STEPS.map((): LaneCell => "empty");
  const step = STEP_OF[state.phase];
  return LANE_STEPS.map((_, index): LaneCell => {
    if (index < step) return "past";
    return index === step ? "current" : "empty";
  });
}

/** The slices of the epic's spec, with their depends; from its summary, without them. */
function slicesOf(epic: ListedChange): readonly Slice[] {
  if (isWhole(epic)) return epic.review.slices;
  return (epic.slices ?? []).map(({ id, title }) => ({ id, title, depends: [] }));
}

/**
 * How a slice finds its change: in the source's answer, when it asks and the source gives it,
 * with the loaded change of that id if there is one; or else among the loaded changes.
 */
function picker(
  epic: ListedChange,
  loaded: readonly ListedChange[],
  answer: SliceAnswer,
): (slice: string) => Implementer | undefined {
  if (asksForSlices(epic.phase) && answer.kind === "given") {
    const given = new Map(answer.changes.map((change) => [change.slice, change]));
    return (slice) => {
      const record = given.get(slice);
      return record === undefined
        ? undefined
        : (loaded.find((change) => change.id === record.id) ?? record);
    };
  }
  const chosen = loadedSliceChanges(epic.id, loaded);
  return (slice) => chosen.get(slice);
}

/** Where a slice with a change stands: finished, or open in its phase, with its decision. */
function stateOf(change: Implementer): LaneState {
  if (change.phase === "done") return { kind: "done" };
  const decision = isLoaded(change) ? change.decision : undefined;
  return decision === undefined
    ? { kind: "open", phase: change.phase }
    : { kind: "open", phase: change.phase, decision };
}

/** The change a line links to: by its id, with its tab when it is loaded. */
function linkOf(change: Implementer | undefined): Pick<EpicLane, "change"> {
  if (change === undefined) return {};
  return { change: isLoaded(change) ? { id: change.id, tab: change.tab } : { id: change.id } };
}

/** Whether the change is loaded, and not only as the source gives it: only a loaded one has a tab. */
function isLoaded(change: Implementer): change is ListedChange {
  return "tab" in change;
}

/** The lines of the loaded changes of `epic`, not cancelled, whose slice `slices` do not name. */
function strays(
  epic: string,
  loaded: readonly ListedChange[],
  slices: readonly Slice[],
): readonly EpicLane[] {
  const named = new Set(slices.map(({ id }) => id));
  return loaded.flatMap((change): EpicLane[] => {
    const slice = change.epic?.id === epic ? (change.epic.slice ?? "") : undefined;
    if (slice === undefined || named.has(slice) || change.phase === "cancelled") return [];
    const title = change.epic?.sliceTitle ?? change.title;
    return [{ key: change.id, slice, title, ...linkOf(change), state: stateOf(change) }];
  });
}
