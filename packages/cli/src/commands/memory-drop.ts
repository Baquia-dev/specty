// SPDX-License-Identifier: Apache-2.0
import {
  droppedEntry,
  isOpenEntry,
  keptEntry,
  type MemoryDropRefusal,
  type MemoryEntry,
  memoryDropCard,
  memoryDropRefusalCard,
  memoryKeptCard,
  type Output,
  parseEntryId,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { editMemory, type MemoryTarget, readMemory } from "../store/memory";
import { openChanges } from "./status";

/** Who writes to the memory: the branch and trailers of its commits, and the author it notes. */
export interface MemoryWriter {
  readonly target: MemoryTarget;
  readonly author: string;
}

/**
 * `specty memory drop` (ADR 0016): the person, at their terminal, drops the entry; an agent, in
 * delegated mode too, only proposes it, and the person sees it in «TE TOCA» of `specty status`.
 */
export async function dropEntry(
  session: Session,
  raw: string,
  reason: string | undefined,
  writer: MemoryWriter,
): Promise<Output> {
  const id = parseEntryId(raw) ?? raw.trim();
  // Dropping is never delegated: only a person at an interactive terminal drops.
  const person = session.actor === "human";
  const open = await openIfTaken(session, writer.target.branch, id);
  const at = session.environment.now().toISOString();
  return editMemory(session.git, writer.target, ({ entries }) => {
    const found = droppable(entries, id, reason?.trim(), person, open);
    if ("refusal" in found) return { result: memoryDropRefusalCard(found.refusal, session.cards) };
    const drop = { reason: found.reason, by: writer.author, at };
    const entry = droppedEntry(found.entry, drop, person);
    return {
      write: { entry, operation: person ? "drop" : "propose-drop" },
      result: memoryDropCard(entry, session.cards),
    };
  });
}

/** `specty memory keep`: an entry proposed to drop is open again. */
export async function keepEntry(
  session: Session,
  raw: string,
  writer: MemoryWriter,
): Promise<Output> {
  const id = parseEntryId(raw) ?? raw.trim();
  return editMemory(session.git, writer.target, ({ entries }) => {
    const entry = entries.find((known) => known.id === id);
    if (entry === undefined)
      return { result: memoryDropRefusalCard({ reason: "unknown", id }, session.cards) };
    if (entry.status !== "drop-proposed")
      return { result: memoryDropRefusalCard({ reason: "not-proposed", entry }, session.cards) };
    const kept = keptEntry(entry);
    return {
      write: { entry: kept, operation: "keep" },
      result: memoryKeptCard(kept, session.cards),
    };
  });
}

/** The ids of the open changes, read only when entry `id` is taken: whether its change is open. */
async function openIfTaken(
  session: Session,
  branch: string,
  id: string,
): Promise<ReadonlySet<string>> {
  const { entries } = await readMemory(session.git, branch);
  if (entries.find((entry) => entry.id === id)?.status !== "taken") return new Set();
  return new Set((await openChanges(session)).map((change) => change.id));
}

/**
 * The entry `id` and the reason to drop it, or why it cannot be dropped. The person may leave out
 * the reason of an entry already proposed: the proposal's stays.
 */
function droppable(
  entries: readonly MemoryEntry[],
  id: string,
  reason: string | undefined,
  person: boolean,
  open: ReadonlySet<string>,
):
  | { readonly entry: MemoryEntry; readonly reason: string }
  | { readonly refusal: MemoryDropRefusal } {
  const entry = entries.find((known) => known.id === id);
  if (entry === undefined) return { refusal: { reason: "unknown", id } };
  if (!isOpenEntry(entry)) return { refusal: { reason: "closed", entry } };
  const why = reasonFor(entry, reason, person);
  if (why === undefined) return { refusal: { reason: "no-reason", id } };
  const change = entry.status === "taken" ? entry.taken?.change : undefined;
  if (change !== undefined && open.has(change))
    return { refusal: { reason: "taken", entry, change } };
  return { entry, reason: why };
}

/** The reason given or, for the person, the one of the proposal to drop the entry. */
function reasonFor(
  entry: MemoryEntry,
  reason: string | undefined,
  person: boolean,
): string | undefined {
  if (reason !== undefined && reason.length > 0) return reason;
  return person && entry.status === "drop-proposed" ? entry.drop?.reason : undefined;
}
