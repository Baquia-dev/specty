// SPDX-License-Identifier: Apache-2.0
import {
  busyChangeCard,
  type Output,
  restoredCard,
  restoreRefusalCard,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { type LostChange, lostChanges, type RestoreOutcome, restoreFolder } from "../flow/lost";
import { entersByName } from "../install/agents";
import type { Session } from "../session";
import { lockChange } from "../store/lock";
import { posixRelative } from "../store/paths";

/**
 * `specty restore <id>`: brings back the folder of an open change whose folder is gone, from its
 * branch (ARCHITECTURE §9). It decides nothing about permissions, like creating the folder in
 * `specty new`, so the agent runs it too; it takes the change's lock, so two at once do not both
 * restore it.
 */
export async function restore(session: Session, id: string): Promise<Output> {
  const { cards } = session;
  const lock = await lockChange(session.git, id, {
    pid: process.pid,
    command: "restore",
    folder: session.root,
    at: session.environment.now().toISOString(),
  });
  if (lock.kind === "busy") {
    const folder = posixRelative(session.root, lock.holder.folder);
    return busyChangeCard(id, { ...lock.holder, folder }, cards);
  }
  try {
    const lost = (await lostChanges(session)).find((change) => change.id === id);
    if (lost === undefined) {
      const folder = await folderOf(session, id);
      return restoreRefusalCard(
        folder === undefined ? { reason: "unknown", id } : { reason: "has-folder", id, folder },
        cards,
      );
    }
    return await restoredOutput(session, lost, await restoreFolder(session, lost));
  } finally {
    await lock.release();
  }
}

/** The folder of the open change `id`, if it has one. */
async function folderOf(session: Session, id: string): Promise<string | undefined> {
  const located = (await locateChanges(session)).find(
    ({ change }) => change.state.id === id && !isFinished(change.state),
  );
  return located?.session.root;
}

/** What `restore` says once it brought the folder back, or why it could not. */
async function restoredOutput(
  session: Session,
  lost: LostChange,
  outcome: RestoreOutcome,
): Promise<Output> {
  const { id, branch } = lost;
  switch (outcome.kind) {
    case "in-the-way":
      return restoreRefusalCard(
        { reason: "in-the-way", id, folder: outcome.folder },
        session.cards,
      );
    case "git":
      return restoreRefusalCard({ reason: "git", id, detail: outcome.detail }, session.cards);
    default: {
      const restored = outcome.kind === "restored" ? outcome : undefined;
      const { hooks = [], workspace } = restored?.copied ?? {};
      return restoredCard(
        {
          id,
          phase: lost.state.phase,
          branch,
          folder: outcome.folder,
          repaired: outcome.kind === "repaired",
          copied: hooks,
          ...(workspace !== undefined ? { workspace } : {}),
          ...(restored?.prepared !== undefined ? { prepared: restored.prepared } : {}),
          byName: await entersByName(session.root),
          agent: session.tool,
        },
        session.cards,
      );
    }
  }
}
