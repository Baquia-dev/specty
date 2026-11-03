// SPDX-License-Identifier: Apache-2.0
import {
  type CheckReport,
  checkDebt,
  checkDebtLines,
  type MemoryEntry,
  nextEntryId,
} from "@baquia-dev/specty-core";
import { writerOf } from "../commands/memory";
import type { MemoryWriter } from "../commands/memory-drop";
import type { Session } from "../session";
import { editMemory, readMemory } from "../store/memory";

/**
 * Whether the run is in CI: `CI` with any value but empty, `false` or `0`, as GitHub Actions,
 * GitLab CI and the other platforms set it. There the memory's branch is not there, and the
 * machine is thrown away at the end.
 */
function inCi(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI?.trim().toLowerCase() ?? "";
  return value !== "" && value !== "false" && value !== "0";
}

/**
 * Keeps the debt of a `check --all` in the memory (ADR 0016), outside CI and one commit each:
 * an improvement for each check with findings not already there, and done the open entry of
 * each check that passed. Each one is checked again against the memory as it is when written.
 * The lines that say which entries it added and marked done.
 */
export async function keepCheckDebt(
  session: Session,
  report: CheckReport,
): Promise<readonly string[]> {
  if (inCi(session.environment.env)) return [];
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const planned = checkDebt(report, entries, session.lang);
  if (planned.add.length === 0 && planned.done.length === 0) return [];
  const writer = await writerOf(session);
  const added = await addDebt(session, writer, report, planned.add);
  const done = await markPaid(session, writer, report, planned.done);
  return checkDebtLines(added, done, session.lang);
}

/** Adds each debt of `texts` still missing from the memory; the ids of those it added. */
async function addDebt(
  session: Session,
  writer: MemoryWriter,
  report: CheckReport,
  texts: readonly string[],
): Promise<string[]> {
  const added: string[] = [];
  for (const text of texts) {
    const id = await editMemory(session.git, writer.target, (memory) => {
      if (!checkDebt(report, memory.entries, session.lang).add.includes(text))
        return { result: undefined };
      const entry: MemoryEntry = {
        id: nextEntryId("improvement", memory.ids),
        kind: "improvement",
        status: "open",
        created: session.environment.now().toISOString(),
        origin: { by: writer.author },
        text,
      };
      return { write: { entry, operation: "add" }, result: entry.id };
    });
    if (id !== undefined) added.push(id);
  }
  return added;
}

/** Marks done each of `paid` still open; the ids of those it marked. */
async function markPaid(
  session: Session,
  writer: MemoryWriter,
  report: CheckReport,
  paid: readonly MemoryEntry[],
): Promise<string[]> {
  const done: string[] = [];
  for (const { id } of paid) {
    const marked = await editMemory(session.git, writer.target, (memory) => {
      const open = checkDebt(report, memory.entries, session.lang).done.find(
        (entry) => entry.id === id,
      );
      if (open === undefined) return { result: false };
      const closed = { at: session.environment.now().toISOString(), by: writer.author };
      const entry: MemoryEntry = { ...open, status: "done", closed };
      return { write: { entry, operation: "done" }, result: true };
    });
    if (marked) done.push(id);
  }
  return done;
}
