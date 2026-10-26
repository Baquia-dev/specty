// SPDX-License-Identifier: Apache-2.0
import type { ChangeKind } from "../spec/model";
import type { Phase } from "./phases";

export type Actor = "agent" | "human" | "specty";

/** Events carry the facts their transition depends on, so callers cannot forget them. */
export type FlowEvent =
  | { readonly type: "propose"; readonly validationErrors: number }
  | { readonly type: "requestChanges" }
  | {
      readonly type: "approve";
      readonly validationErrors: number;
      readonly pendingHighImpact: number;
      /** Tasks of the approved spec not done yet: with none, there is nothing to implement. */
      readonly remainingTasks: number;
    }
  | { readonly type: "taskDone"; readonly remainingTasks: number }
  | { readonly type: "scopeRequest" }
  | { readonly type: "decideScope" }
  | { readonly type: "adjust" }
  | { readonly type: "accept" }
  | { readonly type: "confirmClose"; readonly closingSubmitted: boolean }
  | { readonly type: "childrenDone" }
  | { readonly type: "cancel" };

export type FlowEventType = FlowEvent["type"];

export interface EventRule {
  readonly actors: readonly Actor[];
  readonly from: readonly Phase[];
  /** Grants permissions over code. Such events are never available to the agent. */
  readonly grantsPermission: boolean;
}

const OPEN: readonly Phase[] = [
  "draft",
  "review",
  "implementing",
  "acceptance",
  "adjusting",
  "closing",
];
const ANYONE: readonly Actor[] = ["agent", "human"];
const HUMAN: readonly Actor[] = ["human"];

export const EVENT_RULES: Readonly<Record<FlowEventType, EventRule>> = {
  propose: {
    actors: ANYONE,
    from: ["draft", "review", "adjusting", "closing"],
    grantsPermission: false,
  },
  requestChanges: { actors: HUMAN, from: ["review"], grantsPermission: false },
  approve: { actors: HUMAN, from: ["review"], grantsPermission: true },
  taskDone: { actors: ANYONE, from: ["implementing"], grantsPermission: false },
  scopeRequest: { actors: ANYONE, from: ["implementing"], grantsPermission: false },
  decideScope: { actors: HUMAN, from: ["implementing"], grantsPermission: true },
  adjust: { actors: ANYONE, from: ["acceptance"], grantsPermission: false },
  accept: { actors: HUMAN, from: ["acceptance"], grantsPermission: true },
  confirmClose: { actors: HUMAN, from: ["closing"], grantsPermission: true },
  childrenDone: { actors: ["specty"], from: ["implementing"], grantsPermission: false },
  cancel: { actors: HUMAN, from: OPEN, grantsPermission: false },
};

export const FLOW_EVENTS: readonly FlowEventType[] = Object.keys(EVENT_RULES).filter(
  (type): type is FlowEventType => type in EVENT_RULES,
);

export type RejectionCode =
  | "actor-not-allowed"
  | "phase-not-allowed"
  | "kind-not-allowed"
  | "validation-errors"
  | "pending-assumptions"
  | "closing-not-submitted";

export type TransitionResult =
  | { readonly ok: true; readonly phase: Phase }
  | { readonly ok: false; readonly code: RejectionCode };

export interface TransitionInput {
  readonly phase: Phase;
  readonly kind: ChangeKind;
  readonly actor: Actor;
  readonly event: FlowEvent;
}

/** Kinds without tasks: epics progress through child changes, retros only document. */
const WITHOUT_TASKS: ReadonlySet<ChangeKind> = new Set(["epic", "retro"]);

/** The only way a change moves between phases (ARCHITECTURE §4). Pure. */
export function transition({ phase, kind, actor, event }: TransitionInput): TransitionResult {
  const rule = EVENT_RULES[event.type];
  if (!rule.actors.includes(actor)) return reject("actor-not-allowed");
  if (!rule.from.includes(phase)) return reject("phase-not-allowed");
  switch (event.type) {
    case "propose":
    case "requestChanges":
    case "approve":
      return specOutcome(event, phase, kind);
    case "taskDone":
    case "scopeRequest":
    case "decideScope":
      return taskOutcome(event, kind);
    default:
      return endOutcome(event, kind);
  }
}

type EventOf<T extends FlowEventType> = Extract<FlowEvent, { readonly type: T }>;

/** The spec: proposed, sent back by the person, or approved. */
function specOutcome(
  event: EventOf<"propose" | "requestChanges" | "approve">,
  phase: Phase,
  kind: ChangeKind,
): TransitionResult {
  switch (event.type) {
    case "propose":
      if (event.validationErrors > 0) return reject("validation-errors");
      return to(phase === "closing" ? "closing" : "review");
    case "requestChanges":
      return to("review");
    case "approve":
      return approveOutcome(event, kind);
  }
}

function approveOutcome(event: EventOf<"approve">, kind: ChangeKind): TransitionResult {
  if (event.validationErrors > 0) return reject("validation-errors");
  if (event.pendingHighImpact > 0) return reject("pending-assumptions");
  if (kind === "retro") return to("done");
  // An epic advances through its children; any other change with every task done (a
  // withdrawn adjustment, say) goes straight to acceptance, as after its last task.
  return to(kind === "epic" || event.remainingTasks > 0 ? "implementing" : "acceptance");
}

/** The work on the tasks, which epics and retros do not have. */
function taskOutcome(
  event: EventOf<"taskDone" | "scopeRequest" | "decideScope">,
  kind: ChangeKind,
): TransitionResult {
  if (WITHOUT_TASKS.has(kind)) return reject("kind-not-allowed");
  if (event.type !== "taskDone") return to("implementing");
  return to(event.remainingTasks > 0 ? "implementing" : "acceptance");
}

/** Past the tasks: adjusting, accepting, closing, an epic's slices done, or cancelling. */
function endOutcome(
  event: EventOf<"adjust" | "accept" | "confirmClose" | "childrenDone" | "cancel">,
  kind: ChangeKind,
): TransitionResult {
  switch (event.type) {
    case "adjust":
      return to("adjusting");
    case "accept":
      return to(kind === "quick" ? "done" : "closing");
    case "confirmClose":
      return event.closingSubmitted ? to("done") : reject("closing-not-submitted");
    case "childrenDone":
      return kind === "epic" ? to("acceptance") : reject("kind-not-allowed");
    case "cancel":
      return to("cancelled");
  }
}

function to(phase: Phase): TransitionResult {
  return { ok: true, phase };
}

function reject(code: RejectionCode): TransitionResult {
  return { ok: false, code };
}
