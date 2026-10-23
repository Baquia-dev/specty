// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import { move } from "../io/files";
import type { Session } from "../session";
import { appendAudit, type StoredChange, saveState } from "../store/changes";
import { addReceipt, writePointer } from "../store/local";
import { changeFiles } from "../store/paths";
import { auditEntry } from "./active";
import { changeTrailers, commitWithReceipt } from "./commits";

/**
 * Moves a finished change to `.specty/archive/<year>/<id>` with its final state. Only a person's
 * decision finishes a change: closing, cancelling, accepting a quick one or confirming a retro.
 */
export async function archive(
  session: Session,
  change: StoredChange,
  state: ChangeState,
  event: string,
  data: Readonly<Record<string, unknown>>,
): Promise<StoredChange> {
  await saveState(change.files, state);
  await appendAudit(change.files, auditEntry(session, "human", event, data));
  const target = session.paths.archivedDir(state.id, session.environment.now().getFullYear());
  await move(change.files.dir, target);
  if (!session.config.git.branchPerChange) await writePointer(session.git, "active", undefined);
  return { files: changeFiles(target), state, archived: true };
}

/** Commits the move of a change into the archive (close or cancel). */
export async function commitArchive(
  session: Session,
  before: StoredChange,
  after: StoredChange,
  subject: string,
): Promise<string> {
  const paths = [session.paths.relative(before.files.dir), session.paths.relative(after.files.dir)];
  return commitWithReceipt(session, {
    subject,
    trailers: changeTrailers(session, after.state.id),
    stage: [paths],
    only: paths,
    receipt: { change: after.state.id, kind: "close" },
  });
}

/**
 * A confirmed retro: archived and staged next to the person's own changes, with a receipt
 * for exactly that index, so their next `git commit` passes and carries the documentation.
 */
export async function finishRetro(
  session: Session,
  change: StoredChange,
  state: ChangeState,
): Promise<StoredChange> {
  const archived = await archive(session, change, { ...state, phase: "done" }, "retro.confirmed", {
    mode: session.config.retro.mode,
  });
  await session.git.output(["add", "-A", "--", session.paths.relative(archived.files.dir)]);
  await addReceipt(session.git, {
    tree: await session.git.writeTree(),
    change: state.id,
    kind: "retro",
    createdAt: session.environment.now().toISOString(),
  });
  await writePointer(session.git, "retro", undefined);
  return archived;
}

export function retroTrailers(session: Session, id: string): Record<string, string> {
  return changeTrailers(session, id, { "Specty-Retro": "true" });
}
