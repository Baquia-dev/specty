// SPDX-License-Identifier: Apache-2.0
// What `specty task done` warned about each task, as `task.completed` keeps it: risky patterns in
// what the task added, and assertions it removed from tests that already existed. Pure; it runs
// in the worker, so the screens get each text in both languages.
import { isRiskRule, riskLabel } from "@baquia-dev/specty-core";
import type { AuditRecord } from "./progress";
import type { WarningView } from "./records";

/** The warnings of each task's last `task.completed`, in the order the tasks were completed. */
export function warningsOf(audit: readonly AuditRecord[]): readonly WarningView[] {
  const last = new Map<string, AuditRecord>();
  for (const entry of audit) {
    const { task } = entry.data;
    if (entry.event === "task.completed" && typeof task === "string") last.set(task, entry);
  }
  return [...last.entries()].flatMap(([task, entry]) => [
    ...listOf(entry.data.risks).flatMap((risk): WarningView[] => {
      const { path, rule, cwe, line } = risk;
      if (typeof path !== "string" || !isRiskRule(rule)) return [];
      return [
        {
          task,
          kind: "risk",
          path,
          ...(typeof line === "number" ? { line } : {}),
          ...(typeof cwe === "string" ? { cwe } : {}),
          text: { es: riskLabel(rule, "es"), en: riskLabel(rule, "en") },
        },
      ];
    }),
    ...listOf(entry.data.removedAssertions).flatMap((loss): WarningView[] => {
      const { path, removed } = loss;
      if (typeof path !== "string" || typeof removed !== "number") return [];
      const many = removed !== 1;
      return [
        {
          task,
          kind: "assertions",
          path,
          text: {
            es: `quitó ${removed} ${many ? "aserciones" : "aserción"} de un test que ya existía`,
            en: `removed ${removed} ${many ? "assertions" : "assertion"} from a test that already existed`,
          },
        },
      ];
    }),
  ]);
}

function listOf(value: unknown): Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter(
        (item: unknown): item is Readonly<Record<string, unknown>> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}
