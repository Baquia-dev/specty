// SPDX-License-Identifier: Apache-2.0
import { type Output, pruneCard } from "@baquia-dev/specty-core";
import { deleteMerged, removeFinished } from "../flow/prune";
import type { Session } from "../session";

/**
 * `specty prune`: removes the folders of finished changes and deletes the change branches already
 * in the target branch. Only what is already incorporated goes, so the agent may run it too.
 */
export async function prune(session: Session): Promise<Output> {
  const folders = await removeFinished(session);
  const branches = await deleteMerged(session);
  return pruneCard(
    {
      folders: folders.removed,
      branches: branches.removed,
      kept: [...folders.kept, ...branches.kept],
    },
    session.cards,
  );
}
