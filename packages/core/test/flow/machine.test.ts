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

/**
 * Events with every precondition satisfied; `taskDone` completes the last task, and `approve`
 * finds every task done.
 */
const PASSING: Readonly<Record<FlowEventType, FlowEvent>> = {
  propose: { type: "propose", validationErrors: 0 },
  requestChanges: { type: "requestChanges" },
  approve: {
    type: "approve",
    validationErrors: 0,
    pendingHighImpact: 0,
    remainingTasks: 0,
    testsFirst: false,
  },
  approveTests: { type: "approveTests", testsSubmitted: true },
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
    next: {
      draft: "review",
      review: "review",
      testing: "testing",
      adjusting: "review",
      closing: "closing",
    },
  },
  requestChanges: { actors: ["human"], next: { review: "review" } },
  approveTests: { actors: ["human"], next: { testing: "implementing" } },
  approve: {
    actors: ["human"],
    next: { review: { retro: "done", epic: "implementing", other: "acceptance" } },
  },
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

  it("AC1: lets the person cancel a change in testing", () => {
    const base = { phase: "testing" as const, kind: "standard" as const, actor: "human" as const };
    expect(transition({ ...base, event: { type: "cancel" } })).toEqual({
      ok: true,
      phase: "cancelled",
    });
  });

  it("AC3: keeps a change in testing when its tests are sent, and the person's approval implements it", () => {
    const base = { phase: "testing" as const, kind: "standard" as const };
    const sent = { type: "propose" as const, validationErrors: 0 };
    expect(transition({ ...base, actor: "agent", event: sent })).toEqual({
      ok: true,
      phase: "testing",
    });
    const approve = (testsSubmitted: boolean) => ({
      type: "approveTests" as const,
      testsSubmitted,
    });
    expect(transition({ ...base, actor: "human", event: approve(true) })).toEqual({
      ok: true,
      phase: "implementing",
    });
    expect(transition({ ...base, actor: "human", event: approve(false) })).toEqual({
      ok: false,
      code: "tests-not-submitted",
    });
    expect(transition({ ...base, actor: "agent", event: approve(true) })).toEqual({
      ok: false,
      code: "actor-not-allowed",
    });
  });

  it("AC2: approving a spec whose tests come first starts the testing phase", () => {
    const approve = (remainingTasks: number) => ({
      type: "approve" as const,
      validationErrors: 0,
      pendingHighImpact: 0,
      remainingTasks,
      testsFirst: true,
    });
    const base = { phase: "review" as const, kind: "standard" as const, actor: "human" as const };
    expect(transition({ ...base, event: approve(2) })).toEqual({ ok: true, phase: "testing" });
    // With nothing left to build, there is nothing to test first either.
    expect(transition({ ...base, event: approve(0) })).toEqual({ ok: true, phase: "acceptance" });
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
        event: {
          type: "approve",
          validationErrors: 0,
          pendingHighImpact: 1,
          remainingTasks: 2,
          testsFirst: false,
        },
      }),
    ).toEqual({ ok: false, code: "pending-assumptions" });
    // With tasks to do, approving starts the implementation (AC2).
    for (const kind of ["standard", "quick", "spike", "epic"] as const) {
      expect(
        transition({
          ...base,
          kind,
          event: {
            type: "approve",
            validationErrors: 0,
            pendingHighImpact: 0,
            remainingTasks: 2,
            testsFirst: false,
          },
        }),
        kind,
      ).toEqual({ ok: true, phase: "implementing" });
    }
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

  it("AC4: opens code only to the change's tests in the testing phase", () => {
    expect(phasePermissions("testing")).toEqual({
      code: "tests",
      spec: "locked",
      waitingFor: "agent",
    });
  });

  it("AC5: waits for the person once the tests are sent", () => {
    expect(phasePermissions("testing").waitingFor).toBe("agent");
    expect(phasePermissions("testing", true).waitingFor).toBe("human");
  });

  it("knows who the change is waiting for", () => {
    expect(phasePermissions("review").waitingFor).toBe("human");
    expect(phasePermissions("closing").waitingFor).toBe("agent");
    expect(phasePermissions("closing", true).waitingFor).toBe("human");
    expect(phasePermissions("adjusting").spec).toBe("append-only");
  });

  it("opens the incorporated files and waits for the agent while an incorporation is pending", () => {
    expect(phasePermissions("closing", true, true)).toEqual({
      code: "integration",
      spec: "closing-only",
      waitingFor: "agent",
    });
    expect(phasePermissions("acceptance", false, true)).toEqual({
      code: "integration",
      spec: "locked",
      waitingFor: "agent",
    });
    expect(phasePermissions("closing", true, false)).toEqual({
      code: "blocked",
      spec: "closing-only",
      waitingFor: "human",
    });
    expect(phasePermissions("acceptance").code).toBe("blocked");
  });
});
