// SPDX-License-Identifier: Apache-2.0
import {
  headerOf,
  matchesAny,
  type Output,
  type RetroIntoRefusal,
  retroIntoRefusalCard,
  retroIntoRequestedCard,
} from "@baquia-dev/specty-core";
import { commitState, isFinished, resolveActive } from "../flow/active";
import { changeScope, stagedGoverned, stagedPrint } from "../flow/retro-into";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

/**
 * `specty retro --into <id> --reason "<text>"` (ARCHITECTURE §9): the staged governed code outside
 * the active change's scope becomes a scope request of its active task. Unlike `scope add`, no
 * policy approves it, since the code never went through the guard; its approval lets the commit in.
 */
export async function retroInto(
  session: Session,
  id: string,
  reason: string,
  minimal: boolean,
): Promise<Output> {
  const { cards } = session;
  const target = await targetOf(session, id, reason, minimal);
  if ("refusal" in target) return retroIntoRefusalCard(target.refusal, cards);
  const { open, task } = target;
  const { state } = open;
  const scope = await changeScope(session, open);
  const outside = (await stagedGoverned(session)).filter((path) => !matchesAny(path, scope));
  if (outside.length === 0) {
    return retroIntoRefusalCard({ reason: "nothing-outside", id, phase: state.phase }, cards);
  }
  const number = (state.maxIds.S ?? 0) + 1;
  const request = {
    id: `S${number}`,
    task,
    paths: outside,
    reason: reason.trim(),
    retro: await stagedPrint(session),
  };
  await commitState(
    session,
    open,
    {
      ...state,
      maxIds: { ...state.maxIds, S: number },
      pending: { ...state.pending, scopeRequests: [...state.pending.scopeRequests, request] },
    },
    "scope.requested",
    request,
  );
  return retroIntoRequestedCard(headerOf(id, "implementing"), request.id, outside, cards);
}

/** The change the request goes to and its active task, or why there is none. */
async function targetOf(
  session: Session,
  id: string,
  reason: string,
  minimal: boolean,
): Promise<
  { readonly refusal: RetroIntoRefusal } | { readonly open: StoredChange; readonly task: string }
> {
  if (minimal) return { refusal: { reason: "with-minimal" } };
  if (reason.trim().length === 0) return { refusal: { reason: "no-reason", id } };
  const active = await resolveActive(session);
  const open = active !== undefined && !isFinished(active.state) ? active : undefined;
  if (open?.state.id !== id) {
    return {
      refusal: {
        reason: "not-active",
        id,
        ...(open !== undefined ? { active: open.state.id } : {}),
      },
    };
  }
  const { state } = open;
  const task = Object.entries(state.tasks).find(([, entry]) => entry.status === "active")?.[0];
  if (state.phase !== "implementing" || task === undefined) {
    return { refusal: { reason: "no-task", id, phase: state.phase } };
  }
  return { open, task };
}
