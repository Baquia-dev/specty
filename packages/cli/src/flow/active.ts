// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { appendAudit, loadChange, type StoredChange, saveState } from "../store/changes";
import { readPointer } from "../store/local";

const CHANGE_BRANCH = /^(?:specty|spike)\/(.+)$/;

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
  const id = config.git.branchPerChange
    ? CHANGE_BRANCH.exec((await git.branch()) ?? "")?.[1]
    : await readPointer(git, "active");
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
  actor: "agent" | "human" | "specty" = session.actor,
): Promise<StoredChange> {
  await saveState(change.files, state);
  await appendAudit(change.files, {
    ts: session.environment.now().toISOString(),
    actor,
    ...(actor === "agent" && session.tool !== undefined ? { tool: session.tool } : {}),
    event,
    data,
  });
  return { ...change, state };
}
