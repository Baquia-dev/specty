// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { type ChangeState, closingCommitSubject, type MemoryEntry } from "@baquia-dev/specty-core";
import { exists, move } from "../io/files";
import type { Session } from "../session";
import { appendAudit, type StoredChange, saveState } from "../store/changes";
import { addReceipt, writePointer } from "../store/local";
import { dropMessages } from "../store/messages";
import { changeFiles } from "../store/paths";
import { auditEntry } from "./active";
import { fireReminders, harvestEntries, settleEntries } from "./archive-memory";
import { closingFollowUps } from "./carried";
import { commitWithReceipt, decisionTrailers } from "./commits";
import { remarkHarvest } from "./review-remarks";
import { uncommittedChangedBy } from "./uncommitted";

/**
 * A change in the archive, with what archiving it did in the memory: the entries its closing
 * marked done, the reminders it fired and the pending items its closing left.
 */
export interface ArchivedChange extends StoredChange {
  /** The entries it took that its closing marked done, in order; none if it was cancelled. */
  readonly resolved: readonly MemoryEntry[];
  readonly fired: readonly MemoryEntry[];
  /** The pending items its closing left in the memory, in order; none if it was cancelled. */
  readonly harvested: readonly MemoryEntry[];
}

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
): Promise<ArchivedChange> {
  await saveState(change.files, state);
  await appendAudit(change.files, await auditEntry(session, "human", event, data));
  const target = session.paths.archivedDir(state.id, session.environment.now().getFullYear());
  await move(change.files.dir, target);
  if (!session.config.git.branchPerChange) await writePointer(session.git, "active", undefined);
  // The memory's entries it took get done if it closed, and free again if it was cancelled;
  // a closed change's follow-ups, and the remarks of its last review that its closing does not
  // cite, become pending items.
  const resolved = await settleEntries(session, state);
  // The reminders that waited for it fire, closed or cancelled, so that none is lost; the
  // messages that waited for its session no longer reach anybody.
  const fired = await fireReminders(session, state.id);
  await dropMessages(session.git, state.id);
  const files = changeFiles(target);
  const harvested =
    state.phase === "done"
      ? await harvestEntries(session, state, [
          ...(await closingFollowUps(session, files)).map((text) => ({ text })),
          ...(await remarkHarvest(session, files)),
        ])
      : [];
  return { files, state, archived: true, resolved, fired, harvested };
}

/**
 * Commits the move of a change into the archive (close or cancel). A closed change carries the
 * glossary too, where its closing added the terms it introduced or renamed (ADR 0014).
 */
export async function commitArchive(
  session: Session,
  before: StoredChange,
  after: StoredChange,
  subject: string,
): Promise<string> {
  // A change never approved was never committed: git does not know its old folder.
  const old = session.paths.relative(before.files.dir);
  const paths = [
    ...((await session.git.isTracked(old)) ? [old] : []),
    session.paths.relative(after.files.dir),
    ...(after.state.phase === "done" ? await glossaryPath(session) : []),
  ];
  return commitWithReceipt(session, {
    subject,
    trailers: decisionTrailers(session, after.state.id),
    stage: [paths],
    only: paths,
    receipt: { change: after.state.id, kind: "close" },
  });
}

/**
 * Commits the closing still in the change's folder, with the glossary, before `target` comes in,
 * when `target` changed one of its uncommitted files: uncommitted, that file would stop the merge,
 * and a conflict could not wait for the agent. Otherwise nothing, and the branch stays as it was.
 */
export async function commitClosing(
  session: Session,
  change: StoredChange,
  title: string,
  target: string,
): Promise<void> {
  const paths = [session.paths.relative(change.files.dir), ...(await glossaryPath(session))];
  if ((await uncommittedChangedBy(session, target, paths)).length === 0) return;
  await commitWithReceipt(session, {
    subject: closingCommitSubject(title, session.lang),
    trailers: decisionTrailers(session, change.state.id),
    stage: [paths],
    only: paths,
    receipt: { change: change.state.id, kind: "close" },
  });
}

/** The glossary, where a closing adds the terms it introduced or renamed (ADR 0014), if it exists. */
async function glossaryPath(session: Session): Promise<string[]> {
  const { glossary } = session.config;
  return (await exists(join(session.root, glossary))) ? [glossary] : [];
}

/**
 * A confirmed retro: archived and staged next to the person's own changes, with a receipt
 * for exactly that index, so their next `git commit` passes and carries the documentation.
 */
export async function finishRetro(
  session: Session,
  change: StoredChange,
  state: ChangeState,
): Promise<ArchivedChange> {
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
