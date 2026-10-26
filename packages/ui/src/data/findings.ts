// SPDX-License-Identifier: Apache-2.0
// What the agent learned in each task (`specty task done --finding`), as `task.completed` keeps
// it: the closing takes the findings to its follow-ups, and a change that follows this one gets
// them. Pure; it runs in the worker.
import type { AuditRecord } from "./progress";
import type { FindingView } from "./records";

/** The findings of each task's last `task.completed`, in the order the tasks were completed. */
export function findingsOf(audit: readonly AuditRecord[]): readonly FindingView[] {
  const last = new Map<string, AuditRecord>();
  for (const entry of audit) {
    const { task } = entry.data;
    if (entry.event === "task.completed" && typeof task === "string") last.set(task, entry);
  }
  return [...last.entries()].flatMap(([task, entry]) => {
    const { findings } = entry.data;
    return (Array.isArray(findings) ? findings : [])
      .filter((text: unknown): text is string => typeof text === "string" && text.length > 0)
      .map((text) => ({ task, text }));
  });
}
