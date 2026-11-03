// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import { byDate, isOpenEntry, type MemoryEntry, type MemoryKind } from "./entries";

/** The kinds of entries that the files they are about bring up. */
const PATH_KINDS: ReadonlySet<MemoryKind> = new Set(["lesson", "decision", "reminder"]);

/**
 * The open lessons, decisions and reminders of Specty's memory (ADR 0016) whose paths match one
 * of `files`, either way, as shared files do: `src/api/**` matches `src/api/client.ts`, and a task with
 * `src/**` matches an entry about `src/api/client.ts`. By date.
 */
export function entriesForPaths(
  entries: readonly MemoryEntry[],
  files: readonly string[],
): readonly MemoryEntry[] {
  if (files.length === 0) return [];
  return byDate(
    entries.filter(
      (entry) =>
        isOpenEntry(entry) &&
        PATH_KINDS.has(entry.kind) &&
        (entry.paths ?? []).some((path) =>
          files.some((file) => matchesAny(file, [path]) || matchesAny(path, [file])),
        ),
    ),
  );
}
