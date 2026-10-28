// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import {
  type AuditEntry,
  appendAudit,
  loadChange,
  type StoredChange,
  saveState,
} from "../store/changes";
import { readPointer } from "../store/local";
import { changeOfBranch } from "./branches";

/**
 * The change the current command acts on: a retro in progress first, then the change of
 * the current branch (or of the local pointer when changes do not use branches).
 */
export async function resolveActive(session: Session): Promise<StoredChange | undefined> {
  const { git, paths, config } = session;
  const retro = await readPointer(git, "retro");
  if (retro !== undefined) {
    const change = await loadChange(paths, retro);
    if (change !== undefined && !isFinished(change.state)) return change;
  }
  if (config.git.branchPerChange) {
    const branch = await git.branch();
    return branch === undefined ? undefined : changeOfBranch(session, branch);
  }
  const id = await readPointer(git, "active");
  return id === undefined ? undefined : loadChange(paths, id);
}

export function isFinished(state: ChangeState): boolean {
  return state.phase === "done" || state.phase === "cancelled";
}

/** Saves a new state and records the event that produced it. */
export async function commitState(
  session: Session,
  change: StoredChange,
  state: ChangeState,
  event: string,
  data: Readonly<Record<string, unknown>>,
  actor: AuditEntry["actor"] = session.actor,
): Promise<StoredChange> {
  await saveState(change.files, state);
  await appendAudit(change.files, auditEntry(session, actor, event, data));
  return { ...change, state };
}

/**
 * An audit line. A person's decision that the agent takes in delegated mode (ADR 0010) is the
 * agent's, marked `delegated`.
 */
export function auditEntry(
  session: Session,
  actor: AuditEntry["actor"],
  event: string,
  data: Readonly<Record<string, unknown>>,
): AuditEntry {
  const delegated = actor === "human" && session.actor === "agent" && session.delegated;
  const who = delegated ? "agent" : actor;
  return {
    ts: session.environment.now().toISOString(),
    actor: who,
    ...(who === "agent" && session.tool !== undefined ? { tool: session.tool } : {}),
    event,
    data: delegated ? { ...data, delegated: true } : data,
  };
}
