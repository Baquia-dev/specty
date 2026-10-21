// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type Actor,
  CHANGE_KINDS,
  type ChangeKind,
  EVENT_RULES,
  FLOW_EVENTS,
  type FlowEvent,
  type FlowEventType,
  PHASES,
  type Phase,
  phasePermissions,
  transition,
} from "../../src";

const ACTORS: readonly Actor[] = ["agent", "human", "specty"];

/** Events with every precondition satisfied; `taskDone` completes the last task. */
const PASSING: Readonly<Record<FlowEventType, FlowEvent>> = {
  propose: { type: "propose", validationErrors: 0 },
  requestChanges: { type: "requestChanges" },
  approve: { type: "approve", validationErrors: 0, pendingHighImpact: 0 },
  taskDone: { type: "taskDone", remainingTasks: 0 },
  scopeRequest: { type: "scopeRequest" },
  decideScope: { type: "decideScope" },
  adjust: { type: "adjust" },
  accept: { type: "accept" },
  confirmClose: { type: "confirmClose", closingSubmitted: true },
  childrenDone: { type: "childrenDone" },
  cancel: { type: "cancel" },
};

type Outcome = Phase | "kind-not-allowed";

interface Row {
  readonly actors: readonly Actor[];
  readonly next: Partial<Record<Phase, Outcome | Partial<Record<ChangeKind | "other", Outcome>>>>;
}

/** The transition table of ARCHITECTURE §4, written independently of the implementation. */
const TABLE: Readonly<Record<FlowEventType, Row>> = {
  propose: {
    actors: ["agent", "human"],
    next: { draft: "review", review: "review", adjusting: "review", closing: "closing" },
  },
  requestChanges: { actors: ["human"], next: { review: "review" } },
  approve: { actors: ["human"], next: { review: { retro: "done", other: "implementing" } } },
  taskDone: {
    actors: ["agent", "human"],
    next: {
      implementing: { epic: "kind-not-allowed", retro: "kind-not-allowed", other: "acceptance" },
    },
  },
  scopeRequest: {
    actors: ["agent", "human"],
    next: {
      implementing: { epic: "kind-not-allowed", retro: "kind-not-allowed", other: "implementing" },
    },
  },
  decideScope: {
    actors: ["human"],
    next: {
      implementing: { epic: "kind-not-allowed", retro: "kind-not-allowed", other: "implementing" },
    },
  },
  adjust: { actors: ["agent", "human"], next: { acceptance: "adjusting" } },
  accept: { actors: ["human"], next: { acceptance: { quick: "done", other: "closing" } } },
  confirmClose: { actors: ["human"], next: { closing: "done" } },
  childrenDone: {
    actors: ["specty"],
    next: { implementing: { epic: "acceptance", other: "kind-not-allowed" } },
  },
  cancel: {
    actors: ["human"],
    next: Object.fromEntries(
      PHASES.filter((phase) => phase !== "done" && phase !== "cancelled").map((phase) => [
        phase,
        "cancelled",
      ]),
    ),
  },
};

function expected(phase: Phase, event: FlowEventType, actor: Actor, kind: ChangeKind): string {
  const row = TABLE[event];
  if (!row.actors.includes(actor)) return "actor-not-allowed";
  const next = row.next[phase];
  if (next === undefined) return "phase-not-allowed";
  if (typeof next === "string") return next;
  return next[kind] ?? next.other ?? "missing";
}

describe("transition", () => {
  it("matches the documented table for every phase, event, actor and kind", () => {
    for (const phase of PHASES)
      for (const event of FLOW_EVENTS)
        for (const actor of ACTORS)
          for (const kind of CHANGE_KINDS) {
            const result = transition({ phase, kind, actor, event: PASSING[event] });
            const actual = result.ok ? result.phase : result.code;
            expect(actual, `${phase} --${event}(${actor}, ${kind})`).toBe(
              expected(phase, event, actor, kind),
            );
          }
  });

  it("never lets the agent run an event that grants permissions", () => {
    for (const event of FLOW_EVENTS) {
      const rule = EVENT_RULES[event];
      expect(rule.grantsPermission && rule.actors.includes("agent"), event).toBe(false);
    }
  });

  it("checks the facts each event depends on", () => {
    const base = { phase: "review" as const, kind: "standard" as const, actor: "human" as const };
    expect(transition({ ...base, event: { type: "propose", validationErrors: 2 } })).toEqual({
      ok: false,
      code: "validation-errors",
    });
    expect(
      transition({
        ...base,
        event: { type: "approve", validationErrors: 0, pendingHighImpact: 1 },
      }),
    ).toEqual({ ok: false, code: "pending-assumptions" });
    expect(
      transition({
        ...base,
        phase: "implementing",
        event: { type: "taskDone", remainingTasks: 2 },
      }),
    ).toEqual({ ok: true, phase: "implementing" });
    expect(
      transition({
        ...base,
        phase: "closing",
        event: { type: "confirmClose", closingSubmitted: false },
      }),
    ).toEqual({ ok: false, code: "closing-not-submitted" });
  });
});

describe("phasePermissions", () => {
  it("opens code only for the active task", () => {
    const open = PHASES.filter((phase) => phasePermissions(phase).code === "active-task");
    expect(open).toEqual(["implementing"]);
  });

  it("knows who the change is waiting for", () => {
    expect(phasePermissions("review").waitingFor).toBe("human");
    expect(phasePermissions("closing").waitingFor).toBe("agent");
    expect(phasePermissions("closing", true).waitingFor).toBe("human");
    expect(phasePermissions("adjusting").spec).toBe("append-only");
  });
});
