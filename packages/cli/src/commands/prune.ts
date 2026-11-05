// SPDX-License-Identifier: Apache-2.0
import { type Output, pruneCard } from "@baquia-dev/specty-core";
import { deleteMerged, pruneLive, removeFinished } from "../flow/prune";
import { pruneRecord, RECORD_DAYS } from "../flow/units";
import type { Session } from "../session";

/**
 * `specty prune`: removes the folders of finished changes and deletes the change branches already
 * in the target branch, and the memory's live records that no longer serve anybody: the activity
 * of conversations that no longer work and the messages of changes that are no longer open, and
 * the units recorded as passed more than `RECORD_DAYS` days ago. Only what is already
 * incorporated or dead goes, so the agent may run it too.
 */
export async function prune(session: Session): Promise<Output> {
  const folders = await removeFinished(session);
  const branches = await deleteMerged(session);
  const live = await pruneLive(session);
  const units = await pruneRecord(session);
  return pruneCard(
    {
      folders: folders.removed,
      branches: branches.removed,
      kept: [...folders.kept, ...branches.kept],
      activity: live.activity,
      messages: live.messages,
      units: { removed: units, days: RECORD_DAYS },
    },
    session.cards,
  );
}
