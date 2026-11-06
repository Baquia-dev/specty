// SPDX-License-Identifier: Apache-2.0
import { parseSpec } from "@baquia-dev/specty-core";
import { type SliceChange, sliceChanges } from "../flow/epic";
import { findChange } from "../flow/find";
import type { Session } from "../session";
import { readSpec } from "../store/changes";

/**
 * `GET /api/changes/<id>/slices`: the change of each slice of the epic `id`, open or archived, as
 * the epic's card picks it (`flow/epic.ts`); none for a change of another kind, and undefined when
 * there is no change `id` (ARCHITECTURE §15). The Cortes section of the UI asks for it on its own,
 * so the list of the open changes never reads the archive for it.
 */
export async function epicSliceChanges(
  session: Session,
  id: string,
): Promise<readonly SliceChange[] | undefined> {
  const change = await findChange(session, id);
  if (change === undefined) return undefined;
  if (change.state.kind !== "epic") return [];
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  return sliceChanges(session, change, spec);
}
