// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  firedEntry,
  firedRemindersBlocks,
  harvestable,
  harvestedBlocks,
  type MemoryEntry,
  nextEntryId,
  type Output,
  settledEntry,
  waitingFor,
} from "@baquia-dev/specty-core";
import { authorOf, targetOf } from "../commands/memory";
import type { Session } from "../session";
import { editMemory, readMemory } from "../store/memory";
import type { ArchivedChange } from "./finish";

// What archiving a change does in Specty's memory (ADR 0016): the entries it took get done or free
// again, the reminders that waited for it fire, and its closing leaves pending items and lessons.

/** What a change leaves in the memory: a pending item, or with `paths` a lesson of those paths. */
export interface Harvest {
  readonly text: string;
  readonly paths?: readonly string[];
}

/**
 * What a change leaves in the memory, with that change as its origin, one commit each: the
 * follow-ups of its closing as pending items, and the risks its acceptance takes as lessons.
 * Those already in the memory are left out (`harvestable`). The entries it added, in order.
 */
export async function harvestEntries(
  session: Session,
  state: ChangeState,
  items: readonly Harvest[],
): Promise<MemoryEntry[]> {
  const target = targetOf(session, state.id);
  const texts = items.map(({ text }) => text);
  const added: MemoryEntry[] = [];
  for (const text of harvestable(texts, await readMemory(session.git, target.branch))) {
    const paths = items.find((item) => item.text.trim() === text)?.paths;
    const kind = paths === undefined ? "pending" : "lesson";
    const written = await editMemory(session.git, target, (memory) => {
      if (harvestable([text], memory).length === 0) return { result: undefined };
      const entry: MemoryEntry = {
        id: nextEntryId(kind, memory.ids),
        kind,
        status: "open",
        created: session.environment.now().toISOString(),
        origin: { change: state.id, by: authorOf(session) },
        ...(paths === undefined ? {} : { paths }),
        text,
      };
      return { write: { entry, operation: "add" }, result: entry };
    });
    if (written !== undefined) added.push(written);
  }
  return added;
}

/**
 * The entries a change took, once it is archived: done if it closed, free again if it was
 * cancelled, one commit each. Only those still taken by it; none, no commit.
 */
export async function settleEntries(session: Session, state: ChangeState): Promise<void> {
  const takenHere = (entry: MemoryEntry) =>
    entry.status === "taken" && entry.taken?.change === state.id;
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const ids = entries.filter(takenHere).map((entry) => entry.id);
  if (ids.length === 0) return;
  const target = targetOf(session, state.id);
  const closed =
    state.phase === "done"
      ? { at: session.environment.now().toISOString(), by: authorOf(session) }
      : undefined;
  for (const id of ids) {
    await editMemory(session.git, target, (memory) => {
      const now = memory.entries.find((entry) => entry.id === id);
      if (now === undefined || !takenHere(now)) return { result: undefined };
      const entry = settledEntry(now, closed);
      return { write: { entry, operation: closed ? "done" : "free" }, result: undefined };
    });
  }
}

/**
 * Fires the open reminders that wait for `change`, one commit each: without `onClose`, every
 * session sees them from now on. The ones it fired; one another session changed first, it skips.
 */
export async function fireReminders(session: Session, change: string): Promise<MemoryEntry[]> {
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

/**
 * The card of the command that archived a change, with what it left in the memory after what it
 * says: the reminders it fired and the pending items its closing left.
 */
export function withArchivedMemory(
  session: Session,
  card: Output,
  archived: Pick<ArchivedChange, "fired" | "harvested">,
): Output {
  const blocks = [
    ...firedRemindersBlocks(archived.fired, session.cards),
    ...harvestedBlocks(archived.harvested, session.cards),
  ];
  return { ...card, blocks: [...card.blocks, ...blocks] };
}
