// SPDX-License-Identifier: Apache-2.0
import { hashText } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { appendAudit, type StoredChange } from "../store/changes";
import { auditEntry } from "./active";
import { dataOf, readAudit } from "./carried";

/** A finished run of the full verification: its non-empty output lines, oldest first. */
export interface FullRun {
  readonly command: string;
  /** Exit code; undefined when the process was killed (timeout or signal). */
  readonly code: number | undefined;
  readonly ms: number;
  readonly output: readonly string[];
  /** The code it ran on (`codeTree`), when it could be read. */
  readonly tree?: string;
}

/**
 * The full verification's result in the audit (`change.verified`, formats.md §4), as
 * `task.verified` keeps a task's: command, exit code, duration and, if it failed, its last lines.
 */
export function recordFullVerification(
  session: Session,
  change: StoredChange,
  run: FullRun,
): Promise<void> {
  return appendAudit(
    change.files,
    auditEntry(session, "specty", "change.verified", {
      cmd: run.command,
      exit: run.code ?? null,
      ms: run.ms,
      ...(run.tree === undefined ? {} : { tree: run.tree }),
      ...(run.code === 0 ? {} : { outputTail: run.output.slice(-10) }),
    }),
  );
}

/**
 * Whether the full verification `command` need not run again: its last run, alone or after
 * `verify.quick` in a task, passed on the code there is now. Then where it ran: the task, or none
 * for a full run of `accept` or of the UI. Undefined when it must run.
 */
export async function passedOnThisCode(
  session: Session,
  change: StoredChange,
  command: string,
): Promise<{ readonly task?: string } | undefined> {
  const { quick } = session.config.verify;
  const commands = new Set([command, ...(quick === undefined ? [] : [`${quick} && ${command}`])]);
  const last = (await readAudit(change.files)).findLast(
    (entry) =>
      (entry.event === "task.verified" || entry.event === "change.verified") &&
      commands.has(String(dataOf(entry).cmd)),
  );
  const data = dataOf(last);
  if (data.exit !== 0 || typeof data.tree !== "string") return undefined;
  if (data.tree !== (await codeTree(session))) return undefined;
  return typeof data.task === "string" ? { task: data.task } : {};
}

/**
 * The code a verification runs on: the working tree without `.specty/`, whose files change with
 * every record. A hash of its top-level entries, taken without touching the index; undefined when
 * git cannot tell.
 */
export async function codeTree(session: Session): Promise<string | undefined> {
  try {
    const tree = await session.git.treeWith(["."]);
    const listed = await session.git.run(["ls-tree", tree]);
    if (listed.code !== 0) return undefined;
    const entries = listed.stdout
      .split("\n")
      .filter((line) => line !== "" && !line.endsWith("\t.specty"));
    return hashText(entries.join("\n"));
  } catch {
    return undefined;
  }
}
