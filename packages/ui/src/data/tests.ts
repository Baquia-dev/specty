// SPDX-License-Identifier: Apache-2.0
// The tests a change in `testing` sent for the person's approval (ADR 0014, the gate 2), from the
// last `tests.proposed` of `audit.jsonl` (formats.md §4). Pure: it runs in the derivation worker.
// The audit comes from disk and from older versions of the CLI: every field is read with care.
import type { ChangeState } from "@baquia-dev/specty-core";
import { count, type Data, isData, text, texts } from "./history-text";
import type { AuditRecord } from "./progress";

/** A verification command of the red: it failed, as the new tests ask before the code. */
export interface RedCommand {
  readonly cmd: string;
  /** Its exit code; none when it did not end by itself (a timeout or a signal). */
  readonly exit: number | null;
}

/** The tests of a change in `testing`: what the agent sent and its red, or nothing yet. */
export interface TestsView {
  /** When the agent sent them; none while it writes them. */
  readonly submittedAt?: string;
  /** The new tests, by path. */
  readonly files: readonly string[];
  readonly red: readonly RedCommand[];
}

const redOf = (data: Data): RedCommand[] => {
  const red = data.red;
  if (!Array.isArray(red)) return [];
  return red.filter(isData).flatMap((entry) => {
    const cmd = text(entry, "cmd");
    return cmd === undefined ? [] : [{ cmd, exit: count(entry, "exit") ?? null }];
  });
};

/**
 * Only in `testing`. While `testsSubmittedAt` is set, the last sending is the one waiting; before
 * it, a sending of an earlier cycle (an adjustment goes back to testing) is not shown.
 */
export function testsOf(state: ChangeState, audit: readonly AuditRecord[]): TestsView | undefined {
  if (state.phase !== "testing") return undefined;
  const submittedAt = state.testsSubmittedAt;
  if (submittedAt === undefined) return { files: [], red: [] };
  const data = audit.findLast((entry) => entry.event === "tests.proposed")?.data ?? {};
  return {
    submittedAt,
    files: texts(data, "files").filter((path) => path.trim() !== ""),
    red: redOf(data),
  };
}
