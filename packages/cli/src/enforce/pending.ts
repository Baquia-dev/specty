// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { readText, remove, writeText } from "../io/files";
import type { Session } from "../session";

/**
 * What waits for the next event of a conversation that can carry it to the model, for an agent
 * that cannot take it when Claude Code does (ARCHITECTURE §10): Cursor's card after a compaction,
 * which its `preCompact` cannot add. One file per conversation and kind, under the git directory:
 * `specty/pending/<conversation>.<kind>` (docs/formats.md §1). It is taken once.
 */

export type PendingKind = "card";

/** What nobody took in a day no longer belongs to the conversation, as with the shell snapshots. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export async function leavePending(
  session: Session,
  conversation: string,
  kind: PendingKind,
  text = "",
): Promise<void> {
  await writeText(await pathOf(session, conversation, kind), text);
}

/** What was left for `conversation`, removed as it is read; undefined without it or once expired. */
export async function takePending(
  session: Session,
  conversation: string,
  kind: PendingKind,
): Promise<string | undefined> {
  const path = await pathOf(session, conversation, kind);
  const text = await readText(path);
  if (text === undefined) return undefined;
  const left = (await stat(path)).mtimeMs;
  await remove(path);
  return session.environment.now().getTime() - left > PENDING_TTL_MS ? undefined : text;
}

async function pathOf(session: Session, conversation: string, kind: PendingKind): Promise<string> {
  return join(await session.git.gitPath("specty/pending"), `${conversation}.${kind}`);
}
