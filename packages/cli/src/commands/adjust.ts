// SPDX-License-Identifier: Apache-2.0
import {
  adjustRefusalCard,
  headerOf,
  nextCard,
  noActiveChangeCard,
  type Output,
  transition,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { changeView } from "../flow/views";
import type { Session } from "../session";
import { pendingIntegration } from "./integrate";

/** `specty adjust`: records the user's literal request and returns the classification protocol. */
export async function adjust(session: Session, request: string): Promise<Output> {
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined) return noActiveChangeCard("agent", cards);
  const { state } = active;
  const header = headerOf(state.id, state.phase);
  if (request.trim().length === 0) {
    return adjustRefusalCard({ reason: "no-request" }, header, cards);
  }
  const moved = transition({
    phase: state.phase,
    kind: state.kind,
    actor: session.actor,
    event: { type: "adjust" },
  });
  if (!moved.ok) return adjustRefusalCard({ reason: "not-in-acceptance" }, header, cards);
  // The merge `accept` left here comes first; one someone aborted is forgotten.
  const { integration } = state;
  const pending = await pendingIntegration(session, active, "accept");
  if (pending.kind === "wait" && integration !== undefined)
    return adjustRefusalCard({ reason: "merging", target: integration.target }, header, cards);
  const current = pending.kind === "go" ? pending.change : active;
  const at = session.environment.now().toISOString();
  const updated = await commitState(
    session,
    current,
    {
      ...current.state,
      phase: moved.phase,
      pending: { ...current.state.pending, adjustment: { request: request.trim(), at } },
    },
    "adjust.requested",
    { request: request.trim() },
  );
  return nextCard({ change: await changeView(session, updated), dirty: [] }, cards);
}
