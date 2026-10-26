// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  checkStatus,
  decisionCard,
  headerOf,
  noActiveChangeCard,
  noScopeRequestCard,
  nothingChangedCard,
  nothingPendingCard,
  notInteractiveCard,
  type Output,
  rejectionQuestion,
  scopeDecidedLine,
  scopeDecisionQuestion,
  transition,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { canDecide } from "./human";
import { thenNext } from "./next";
import { withExtras } from "./scope";

/** `specty reject --scope S`: a person turns down a scope request. */
export async function reject(
  session: Session,
  scope: string,
  reason: string | undefined,
): Promise<Output> {
  const { cards } = session;
  if (!canDecide(session)) return notInteractiveCard("reject", cards);
  const active = await resolveActive(session);
  if (active === undefined) return noActiveChangeCard("person", cards);
  return decideScope(session, active, scope, "reject", reason);
}

export async function decideScope(
  session: Session,
  active: StoredChange,
  scope: string,
  decision: "approve" | "reject",
  reason: string | undefined,
): Promise<Output> {
  const { cards } = session;
  const { state } = active;
  const { terminal } = session.environment;
  if (state.phase !== "implementing")
    return nothingPendingCard(state.id, state.phase, decision, cards);
  const header = headerOf(state.id, "implementing");
  const request = state.pending.scopeRequests.find(
    (entry) => entry.id === scope.trim().toUpperCase(),
  );
  if (request === undefined) return noScopeRequestCard(scope, header, cards);
  terminal.note(
    `${request.id} · ${request.task}`,
    `${request.paths.join("\n")}\n— ${request.reason}`,
  );
  const why =
    decision === "reject"
      ? (reason ?? (await terminal.ask(rejectionQuestion("scope", session.lang))))
      : undefined;
  const confirmed = await terminal.confirm(scopeDecisionQuestion(decision, request, session.lang));
  if (!confirmed) return nothingChangedCard(header, checkStatus(cards), cards);
  const moved = transition({
    phase: "implementing",
    kind: state.kind,
    actor: "human",
    event: { type: "decideScope" },
  });
  if (!moved.ok) return blockedCard(header, moved.code, checkStatus(cards));
  const remaining = state.pending.scopeRequests.filter((entry) => entry !== request);
  const base = { ...state, pending: { ...state.pending, scopeRequests: remaining } };
  const next = decision === "approve" ? withExtras(base, request.task, request.paths) : base;
  await commitState(
    session,
    active,
    next,
    "scope.decided",
    {
      id: request.id,
      decision: decision === "approve" ? "approved" : "rejected",
      ...(why !== undefined && why.trim().length > 0 ? { reason: why.trim() } : {}),
    },
    "human",
  );
  return thenNext(
    session,
    decisionCard(header, [scopeDecidedLine(decision, request, session.lang)], cards),
  );
}
