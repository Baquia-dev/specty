// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type ChangeState,
  ChangeStateSchema,
  changeWaitsFor,
  PHASES,
  phasePermissions,
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
