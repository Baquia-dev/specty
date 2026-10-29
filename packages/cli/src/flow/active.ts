// SPDX-License-Identifier: Apache-2.0
import { busyChangeCard, type ChangeState, type Output } from "@baquia-dev/specty-core";
import { agentRun } from "../agents/run";
import type { Session } from "../session";
import {
  type AuditEntry,
  appendAudit,
  loadChange,
  type StoredChange,
  saveState,
} from "../store/changes";
import { readPointer } from "../store/local";
import { lockChange } from "../store/lock";
import { posixRelative } from "../store/paths";
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

/**
 * Runs `command` with the change of the session's folder locked (formats.md §1): another command
 * changing it at the same time gets the busy card and changes nothing. Without a change, it runs
 * as is.
 */
export async function withChangeLock(
  session: Session,
  command: string,
  handler: () => Promise<Output>,
): Promise<Output> {
  const change = await resolveActive(session);
  if (change === undefined) return handler();
  const lock = await lockChange(session.git, change.state.id, {
    pid: process.pid,
    command,
    folder: session.root,
    at: session.environment.now().toISOString(),
  });
  if (lock.kind === "busy") {
    const folder = posixRelative(session.root, lock.holder.folder);
    return busyChangeCard(change.state.id, { ...lock.holder, folder }, session.cards);
  }
  try {
    return await handler();
  } finally {
    await lock.release();
  }
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
  await appendAudit(change.files, await auditEntry(session, actor, event, data));
  return { ...change, state };
}

/**
 * An audit line. A person's decision that the agent takes in delegated mode (ADR 0010) is the
 * agent's, marked `delegated`. A person's line, and a delegated one, name the person (`by`, their
 * git name); an agent's line carries the model and the effort the agent tells, if any.
 */
export async function auditEntry(
  session: Session,
  actor: AuditEntry["actor"],
  event: string,
  data: Readonly<Record<string, unknown>>,
): Promise<AuditEntry> {
  const delegated = actor === "human" && session.actor === "agent" && session.delegated;
  const who = delegated ? "agent" : actor;
  return {
    ts: session.environment.now().toISOString(),
    actor: who,
    ...(who === "agent" && session.tool !== undefined ? { tool: session.tool } : {}),
    ...(await told(session, who, delegated)),
    event,
    data: delegated ? { ...data, delegated: true } : data,
  };
}

/** What a line tells of who acted: the person's git name, or the agent's session, model and effort. */
async function told(
  session: Session,
  who: AuditEntry["actor"],
  delegated: boolean,
): Promise<Pick<AuditEntry, "by" | "session" | "model" | "effort">> {
  const by = who === "human" || delegated ? await session.git.config("user.name") : undefined;
  const run = who === "agent" ? await agentRun(session.tool, session.environment.env) : {};
  return { ...(by === undefined ? {} : { by }), ...run };
}
