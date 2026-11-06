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
