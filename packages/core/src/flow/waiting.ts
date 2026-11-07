// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, isIntegrating } from "../schema/state";
import { phasePermissions, type WaitingFor } from "./phases";

/**
 * Who the change waits for (ARCHITECTURE §4): the one rule of `specty wait`, the end of the
 * agent's turn, the guard's brake on `sleep`, `status` and the decisions nobody picks up in the UI.
 * The person while a scope request is pending; the agent in review once the person sent the
 * review back (`changesRequestedAt`), until its next proposal; otherwise, as the phase says with
 * what the agent sent and a pending incorporation.
 */
export function changeWaitsFor(
  state: Pick<
    ChangeState,
    | "phase"
    | "pending"
    | "testsSubmittedAt"
    | "closingSubmittedAt"
    | "changesRequestedAt"
    | "integration"
  >,
): WaitingFor {
  if (state.pending.scopeRequests.length > 0) return "human";
  if (state.phase === "review" && state.changesRequestedAt !== undefined) return "agent";
  const submitted =
    (state.phase === "testing" ? state.testsSubmittedAt : state.closingSubmittedAt) !== undefined;
  return phasePermissions(state.phase, submitted, isIntegrating(state)).waitingFor;
}

/** A scope request, as far as what it unlocks goes. */
type RequestPaths = Pick<ChangeState["pending"]["scopeRequests"][number], "paths">;

/**
 * Whether scope request `request` unlocks a test the person approved, one of `lockedTests`: only
 * the person decides it, in delegated mode too (ADR 0014).
 */
export function unlocksApprovedTest(
  request: RequestPaths,
  state: Pick<ChangeState, "lockedTests">,
): boolean {
  return request.paths.some((path) => Object.hasOwn(state.lockedTests ?? {}, path));
}

/**
 * Whether the change waits for a decision the person takes themselves, the rule of `specty wait`:
 * what `changeWaitsFor` gives the person and, in delegated mode (ADR 0010), only what no
 * delegation covers. Of what a change waits for, that is unlocking an approved test: every pending
 * scope request unlocks one, since one the agent decides is enough for it to carry on.
 */
export function waitsForPerson(
  state: Parameters<typeof changeWaitsFor>[0] & Pick<ChangeState, "lockedTests">,
  delegated: boolean,
): boolean {
  if (changeWaitsFor(state) !== "human") return false;
  if (!delegated) return true;
  const requests = state.pending.scopeRequests;
  return requests.length > 0 && requests.every((request) => unlocksApprovedTest(request, state));
}
