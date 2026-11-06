// SPDX-License-Identifier: Apache-2.0
import { type Output, pruneCard } from "@baquia-dev/specty-core";
import { cleanUp, deleteMerged, pruneLive } from "../flow/prune";
import { pruneRecord, RECORD_DAYS } from "../flow/units";
import type { Session } from "../session";
import { removeLeftovers } from "../store/leftovers";

/**
 * `specty prune`: the clean-up (`cleanUp`: the records of worktrees whose folder is gone, the
 * folders of finished changes and the ghost ones, saving first what they have in a rescue ref, and
 * the empty folders of `.specty/changes/`), and it deletes the change branches already in the
 * target branch, and the memory's live records that no longer serve anybody: the activity of
 * conversations that no longer work and the messages of changes that are no longer open, and the
 * units recorded as passed more than `RECORD_DAYS` days ago; and what processes that died left in
 * git's folders. Only what is already incorporated, dead or saved goes, so the agent may run it too.
 */
export async function prune(session: Session): Promise<Output> {
  const swept = await cleanUp(session);
  const branches = await deleteMerged(session);
  const live = await pruneLive(session);
  const units = await pruneRecord(session);
  const leftovers = await removeLeftovers(session.git, session.environment.now());
  return pruneCard(
    {
      folders: swept.removed,
      ghosts: swept.ghosts,
      rescued: swept.rescued,
      unsaved: swept.unsaved,
      records: swept.records,
      empty: swept.empty,
      branches: branches.removed,
      kept: [...swept.kept, ...branches.kept],
      activity: live.activity,
      messages: live.messages,
      units: { removed: units, days: RECORD_DAYS },
      leftovers,
    },
    session.cards,
  );
}
