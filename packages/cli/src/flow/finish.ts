// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type ChangeState,
  firedEntry,
  firedRemindersBlocks,
  type MemoryEntry,
  type Output,
  waitingFor,
} from "@baquia-dev/specty-core";
import { harvestEntries, settleEntries, targetOf } from "../commands/memory";
import { exists, move } from "../io/files";
import type { Session } from "../session";
import { appendAudit, type StoredChange, saveState } from "../store/changes";
import { addReceipt, writePointer } from "../store/local";
import { editMemory, readMemory } from "../store/memory";
import { dropMessages } from "../store/messages";
import { changeFiles } from "../store/paths";
import { auditEntry } from "./active";
import { closingFollowUps } from "./carried";
import { commitWithReceipt, decisionTrailers } from "./commits";
import { remarkHarvest } from "./review-remarks";

/** A change in the archive, with the reminders that waited for it, which it fired. */
export interface ArchivedChange extends StoredChange {
  readonly fired: readonly MemoryEntry[];
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
  await settleEntries(session, state);
  // The reminders that waited for it fire, closed or cancelled, so that none is lost; the
  // messages that waited for its session no longer reach anybody.
  const fired = await fireReminders(session, state.id);
  await dropMessages(session.git, state.id);
  const files = changeFiles(target);
  if (state.phase === "done")
    await harvestEntries(session, state, [
      ...(await closingFollowUps(session, files)).map((text) => ({ text })),
      ...(await remarkHarvest(session, files)),
    ]);
  return { files, state, archived: true, fired };
}

/**
 * Fires the open reminders that wait for `change`, one commit each: without `onClose`, every
 * session sees them from now on. The ones it fired; one another session changed first, it skips.
 */
async function fireReminders(session: Session, change: string): Promise<MemoryEntry[]> {
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const target = targetOf(session, change);
  const fired: MemoryEntry[] = [];
  for (const { id } of waitingFor(entries, change)) {
    const entry = await editMemory(session.git, target, (memory) => {
      const now = waitingFor(memory.entries, change).find((waiting) => waiting.id === id);
      if (now === undefined) return { result: undefined };
      const fire = firedEntry(now);
      return { write: { entry: fire, operation: "fire" }, result: fire };
    });
    if (entry !== undefined) fired.push(entry);
  }
  return fired;
}

/** The card of the command that archived a change, with the reminders it fired after what it says. */
export function withFiredReminders(
  session: Session,
  card: Output,
  fired: readonly MemoryEntry[],
): Output {
  return { ...card, blocks: [...card.blocks, ...firedRemindersBlocks(fired, session.cards)] };
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
  const { glossary } = session.config;
  const terms = after.state.phase === "done" && (await exists(join(session.root, glossary)));
  const paths = [
    ...((await session.git.isTracked(old)) ? [old] : []),
    session.paths.relative(after.files.dir),
    ...(terms ? [glossary] : []),
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
