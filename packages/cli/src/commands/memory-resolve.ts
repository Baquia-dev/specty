// SPDX-License-Identifier: Apache-2.0
import {
  claimable,
  freeWork,
  type MemoryEntry,
  memoryResolvedCard,
  memoryResolveRefusalCard,
  type Output,
  type ResolvesRefusal,
  resolvesRefusalCard,
  takenEntry,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive, withChangeLock } from "../flow/active";
import type { Session } from "../session";
import { editMemory, type MemoryTarget, readMemory } from "../store/memory";
import type { MemoryWriter } from "./memory-drop";
import { openChanges } from "./status";

// The entries of Specty's memory a change takes (ADR 0016): `specty new --resolves`, for the
// change it creates, and `specty memory resolve`, from inside the open change whose work resolved
// them. Both take them with the same rules, and the change's archiving settles them.

/**
 * `specty memory resolve`: takes the entries `ids` names for this folder's open change, with the
 * rules of `new --resolves`, or takes none and says why. One this change already took stays as it
 * is, without a commit.
 */
export function resolveEntries(
  session: Session,
  ids: readonly string[],
  writer: MemoryWriter,
): Promise<Output> {
  return withChangeLock(session, "memory resolve", async () => {
    const active = await resolveActive(session);
    if (active === undefined || isFinished(active.state))
      return memoryResolveRefusalCard({ reason: "no-change" }, session.cards);
    const change = active.state.id;
    const claim = await claimOf(session, ids, change);
    if ("refusal" in claim) return memoryResolveRefusalCard(claim.refusal, session.cards);
    const takenHere = (entry: MemoryEntry) =>
      entry.status === "taken" && entry.taken?.change === change;
    await takeEntries(
      session,
      writer.target,
      change,
      claim.entries.filter((entry) => !takenHere(entry)),
    );
    const named = new Set(claim.entries.map((entry) => entry.id));
    const { entries } = await readMemory(session.git, writer.target.branch);
    const taken = entries.filter((entry) => named.has(entry.id) && takenHere(entry));
    return memoryResolvedCard(taken, session.cards);
  });
}

/**
 * What `specty new --resolves` takes: the entries `ids` names, or the card of why it takes none.
 * The open changes are read only when some entry is taken, to say which one took it.
 */
export async function claimEntries(
  session: Session,
  ids: readonly string[],
): Promise<{ readonly entries: readonly MemoryEntry[] } | { readonly refusal: Output }> {
  const claim = await claimOf(session, ids);
  return "refusal" in claim
    ? { refusal: resolvesRefusalCard(claim.refusal, session.cards) }
    : claim;
}

/**
 * The entries `ids` names, ready to be taken, or why they cannot be. `self`, the change that
 * takes them, is not another change that took one first. The open changes are read only when
 * some entry is taken.
 */
async function claimOf(
  session: Session,
  ids: readonly string[],
  self?: string,
): Promise<{ readonly entries: readonly MemoryEntry[] } | { readonly refusal: ResolvesRefusal }> {
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const open = entries.some((entry) => entry.status === "taken") ? await openChanges(session) : [];
  const others = new Set(open.map((change) => change.id).filter((id) => id !== self));
  const claim = claimable(ids, entries, others);
  if ("entries" in claim) return claim;
  const { problem } = claim;
  if (problem.reason !== "taken") return { refusal: problem };
  const by = open.find((change) => change.id === problem.change);
  // `claimable` only names a change among the open ones.
  if (by === undefined) throw new Error(`${problem.change}: not an open change`);
  // The first free one, even if `new` asked for it too: without the taken one, it can go on.
  const [free] = freeWork(entries);
  return {
    refusal: { reason: "taken", entry: problem.entry, by, ...(free !== undefined ? { free } : {}) },
  };
}

/**
 * Marks each of `claimed` taken by `change`, one commit each, written to `target`. One that
 * changed since it was checked, because another session took it first, stays as that session
 * left it.
 */
export async function takeEntries(
  session: Session,
  target: MemoryTarget,
  change: string,
  claimed: readonly MemoryEntry[],
): Promise<void> {
  const at = session.environment.now().toISOString();
  for (const checked of claimed) {
    await editMemory(session.git, target, ({ entries }) => {
      const now = entries.find((entry) => entry.id === checked.id);
      if (
        now === undefined ||
        now.status !== checked.status ||
        now.taken?.change !== checked.taken?.change
      )
        return { result: undefined };
      return {
        write: { entry: takenEntry(now, change, at), operation: "take" },
        result: undefined,
      };
    });
  }
}
