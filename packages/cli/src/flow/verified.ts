// SPDX-License-Identifier: Apache-2.0
import type { Session } from "../session";
import { appendAudit, type StoredChange } from "../store/changes";
import { auditEntry } from "./active";

/** A finished run of the full verification: its non-empty output lines, oldest first. */
export interface FullRun {
  readonly command: string;
  /** Exit code; undefined when the process was killed (timeout or signal). */
  readonly code: number | undefined;
  readonly ms: number;
  readonly output: readonly string[];
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
      ...(run.code === 0 ? {} : { outputTail: run.output.slice(-10) }),
    }),
  );
}
