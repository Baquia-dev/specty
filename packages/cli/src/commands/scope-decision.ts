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
  retroIntoApprovedCard,
  retroIntoStaleCard,
  retroIntoStaleReason,
  scopeDecidedLine,
  scopeDecisionQuestion,
  transition,
  type UnlockPatchRefusal,
  unlockRefusedCard,
  unlockStaleCard,
  unlockStaleReason,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { confirmRetroInto, stagedPrint } from "../flow/retro-into";
import { checkUnlockPatch } from "../flow/unlock-proposal";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { canDecide } from "./human";
import { thenNext } from "./next";
import { withExtras } from "./scope";

type ScopeRequest = StoredChange["state"]["pending"]["scopeRequests"][number];

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
  // Unlocking an approved test is the person's alone, in delegated mode too (ADR 0014).
  const unlocks = request.paths.filter((path) => Object.hasOwn(state.lockedTests ?? {}, path));
  if (unlocks.length > 0 && session.actor === "agent") {
    return unlockRefusedCard(header, request.id, cards);
  }
  const stale = await staleRequest(session, state, request, decision === "approve" ? unlocks : []);
  if (stale !== undefined) return rejectStale(session, active, request, { header, stale });
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
  return recordScopeDecision(session, active, request, { decision, header, why, unlocks });
}

/** The decision taken: the request leaves the queue and, approved, widens its task's scope. */
async function recordScopeDecision(
  session: Session,
  active: StoredChange,
  request: ScopeRequest,
  taken: {
    readonly decision: "approve" | "reject";
    readonly header: string;
    readonly why: string | undefined;
    /** The approved tests the request unlocks for its task. */
    readonly unlocks: readonly string[];
  },
): Promise<Output> {
  const { state } = active;
  const { decision, header, why, unlocks } = taken;
  const { cards } = session;
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
  const updated = await commitState(
    session,
    active,
    next,
    "scope.decided",
    {
      id: request.id,
      decision: decision === "approve" ? "approved" : "rejected",
      ...(why !== undefined && why.trim().length > 0 ? { reason: why.trim() } : {}),
      // The acceptance shows each test a person unlocked, with its request and its task.
      ...(decision === "approve" && unlocks.length > 0 ? unlockDecided(request, unlocks) : {}),
    },
    "human",
  );
  if (decision === "approve" && request.retro !== undefined) {
    await confirmRetroInto(session, updated, request);
    return retroIntoApprovedCard(header, request, state.id, session.actor === "agent", cards);
  }
  return thenNext(
    session,
    decisionCard(header, [scopeDecidedLine(decision, request, session.lang)], cards),
  );
}

/**
 * What `scope.decided` keeps of an approved unlock: the tests, their task, and the patch and the
 * evidence it was asked with, which a request of an older CLI does not have (ADR 0014).
 */
function unlockDecided(request: ScopeRequest, unlocks: readonly string[]): Record<string, unknown> {
  return {
    unlock: unlocks,
    task: request.task,
    ...(request.patch === undefined ? {} : { patch: request.patch }),
    ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
  };
}

/**
 * Why Specty rejects `request` before the person decides it: the staged code of a `retro --into`
 * changed since it was asked, or the patch of an unlock being approved no longer holds for the
 * `unlocks` tests as they were locked (ADR 0014). A request of an older CLI has no patch to check.
 */
async function staleRequest(
  session: Session,
  state: StoredChange["state"],
  request: ScopeRequest,
  unlocks: readonly string[],
): Promise<"retro" | UnlockPatchRefusal | undefined> {
  // A request of `retro --into` documents the staged code it was asked for, not what is there now.
  if (request.retro !== undefined && request.retro !== (await stagedPrint(session))) return "retro";
  if (request.patch === undefined || unlocks.length === 0) return undefined;
  return checkUnlockPatch(session, state, unlocks, request.patch);
}

/** Specty rejects a request that no longer holds, with why, and the person is told. */
async function rejectStale(
  session: Session,
  active: StoredChange,
  request: ScopeRequest,
  taken: { readonly header: string; readonly stale: "retro" | UnlockPatchRefusal },
): Promise<Output> {
  const { state } = active;
  const { header, stale } = taken;
  const remaining = state.pending.scopeRequests.filter((entry) => entry !== request);
  const reason =
    stale === "retro" ? retroIntoStaleReason(session.lang) : unlockStaleReason(stale, session.lang);
  await commitState(
    session,
    active,
    { ...state, pending: { ...state.pending, scopeRequests: remaining } },
    "scope.decided",
    { id: request.id, decision: "rejected", reason },
    "specty",
  );
  return stale === "retro"
    ? retroIntoStaleCard(header, request.id, state.id, session.actor === "agent", session.cards)
    : unlockStaleCard(header, request.id, stale, session.cards);
}
