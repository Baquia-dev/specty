// SPDX-License-Identifier: Apache-2.0
import type { Session } from "../session";
import { loadChange, type StoredChange } from "../store/changes";
import { repoPaths } from "../store/paths";
import { locateChanges } from "./changes";

/**
 * A change by its id, wherever it is: here, open or archived; open in another worktree; or
 * archived in the main folder, where a closed change lands once it is incorporated.
 */
export async function findChange(session: Session, id: string): Promise<StoredChange | undefined> {
  const here = await loadChange(session.paths, id);
  if (here !== undefined) return here;
  const open = (await locateChanges(session)).find(({ change }) => change.state.id === id);
  if (open !== undefined) return open.change;
  const main = (await session.git.worktrees())[0]?.folder;
  return main === undefined ? undefined : loadChange(repoPaths(main), id);
}
