// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type ChangeState,
  ChangeStateSchema,
  changeWaitsFor,
  PHASES,
  phasePermissions,
  unlocksApprovedTest,
  waitsForPerson,
} from "../../src";

const AT = "2026-11-06T10:00:00.000Z";

/** A change in review that nobody sent back yet. */
const BASE: ChangeState = ChangeStateSchema.parse({
  schema: 1,
  id: "20261106-saludo-personalizado",
  kind: "standard",
  phase: "review",
  revision: 1,
  items: {},
  tasks: {},
  pending: { scopeRequests: [], adjustment: null },
  maxIds: {},
});

const SCOPE = { id: "S1", task: "T1", paths: ["src/extra.ts"], reason: "Ayudante" };

const INTEGRATION = {
  target: "main",
  commit: "b4c5d6e",
  reason: "conflicts",
  conflicts: ["src/app.ts"],
  paths: ["src/app.ts"],
  at: AT,
};

describe("who a change waits for", () => {
  it("AC5: in review, waits for the person until they ask for changes, then for the agent", () => {
    expect(changeWaitsFor(BASE)).toBe("human");
    expect(changeWaitsFor({ ...BASE, changesRequestedAt: AT })).toBe("agent");
  });

  it("AC5: waits for the person while a scope request is pending", () => {
    const scoped = ChangeStateSchema.parse({
      ...BASE,
      phase: "implementing",
      pending: { scopeRequests: [SCOPE], adjustment: null },
    });
    expect(changeWaitsFor(scoped)).toBe("human");
    expect(changeWaitsFor({ ...scoped, pending: { ...scoped.pending, scopeRequests: [] } })).toBe(
      "agent",
    );
  });

  it("AC5: in every other case, says what phasePermissions says with the submission and the pending incorporation", () => {
    for (const phase of PHASES) {
      for (const submitted of [false, true]) {
        for (const integrating of [false, true]) {
          const sent = submitted
            ? phase === "testing"
              ? { testsSubmittedAt: AT }
              : { closingSubmittedAt: AT }
            : {};
          const state = ChangeStateSchema.parse({
            ...BASE,
            phase,
            ...sent,
            ...(integrating ? { integration: INTEGRATION } : {}),
          });
          const label = `${phase}, submitted ${submitted}, integrating ${integrating}`;
          const expected = phasePermissions(phase, submitted, integrating).waitingFor;
          expect(changeWaitsFor(state), label).toBe(expected);
          // The changes the person asked for count only in review.
          if (phase !== "review") {
            expect(changeWaitsFor({ ...state, changesRequestedAt: AT }), label).toBe(expected);
          }
        }
      }
    }
  });
});

/** The hash a test approved by the person keeps in `lockedTests`. */
const LOCK = `sha256:${"a".repeat(64)}`;

/** A change implementing T1 with `requests` pending and `src/app.test.ts` approved and locked. */
const implementing = (...requests: (typeof SCOPE)[]): ChangeState =>
  ChangeStateSchema.parse({
    ...BASE,
    phase: "implementing",
    pending: { scopeRequests: requests, adjustment: null },
    lockedTests: { "src/app.test.ts": LOCK },
  });

const UNLOCK = { ...SCOPE, id: "S2", paths: ["src/other.ts", "src/app.test.ts"] };

describe("what waits for the person, in delegated mode", () => {
  it("AC1, AC2: a request unlocks an approved test when one of its paths is locked", () => {
    const state = implementing();
    expect(unlocksApprovedTest(SCOPE, state)).toBe(false);
    expect(unlocksApprovedTest(UNLOCK, state)).toBe(true);
    expect(unlocksApprovedTest(UNLOCK, { ...state, lockedTests: undefined })).toBe(false);
  });

  it("AC2: without delegated mode, is what changeWaitsFor gives the person", () => {
    for (const state of [BASE, implementing(SCOPE), implementing(UNLOCK), implementing()]) {
      expect(waitsForPerson(state, false)).toBe(changeWaitsFor(state) === "human");
    }
  });

  it("AC1: in delegated mode, no decision the agent takes for the person waits for them", () => {
    expect(waitsForPerson(BASE, true)).toBe(false);
    for (const [phase, sent] of [
      ["testing", { testsSubmittedAt: AT }],
      ["acceptance", {}],
      ["closing", { closingSubmittedAt: AT }],
    ] as const) {
      const state = ChangeStateSchema.parse({ ...BASE, phase, ...sent });
      expect(changeWaitsFor(state), phase).toBe("human");
      expect(waitsForPerson(state, true), phase).toBe(false);
    }
    expect(waitsForPerson(implementing(SCOPE), true)).toBe(false);
    // One request the agent decides is enough for it to carry on.
    expect(waitsForPerson(implementing(SCOPE, UNLOCK), true)).toBe(false);
  });

  it("AC2: in delegated mode, waits for the person while every pending request unlocks an approved test", () => {
    expect(waitsForPerson(implementing(UNLOCK), true)).toBe(true);
    expect(waitsForPerson(implementing(UNLOCK, { ...UNLOCK, id: "S3" }), true)).toBe(true);
    // Nothing the person decides: neither does the agent wait.
    expect(waitsForPerson(implementing(), true)).toBe(false);
  });
});
