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
  const at = session.environment.now().toISOString();
  const updated = await commitState(
    session,
    active,
    {
      ...state,
      phase: moved.phase,
      pending: { ...state.pending, adjustment: { request: request.trim(), at } },
    },
    "adjust.requested",
    { request: request.trim() },
  );
  return nextCard({ change: await changeView(session, updated), dirty: [] }, cards);
}
