// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { riskLabel } from "../scope/risk";
import { translator } from "./text";
import type { TaskView } from "./view";

// The risks a change's acceptance takes (ADR 0016): each file and pattern becomes a lesson of the
// memory about that file, so that the task card shows it to whoever touches the file again.

/** A lesson of the memory to add: its text and the file it is about. */
export interface RiskLesson {
  readonly text: string;
  readonly paths: readonly string[];
}

/**
 * The lessons of the risks of `tasks`, one for each file and pattern, in the order they came; a
 * rule of the person counts by its text. The text leaves out the line, which moves with each
 * edit, so the same risk reads the same.
 */
export function riskLessons(tasks: readonly Pick<TaskView, "risks">[], lang: Lang): RiskLesson[] {
  const t = translator(lang);
  const seen = new Set<string>();
  return tasks.flatMap(({ risks }) =>
    (risks ?? []).flatMap(({ path, rule, cwe, label }) => {
      const key = [path, rule, label].join("\n");
      if (seen.has(key)) return [];
      seen.add(key);
      const what = `${riskLabel(rule, lang, label)}${cwe === undefined ? "" : ` (${cwe})`}`;
      const text = t(
        `Riesgo aceptado en \`${path}\`: ${what}. Revísalo antes de ampliarlo.`,
        `Accepted risk in \`${path}\`: ${what}. Review it before extending it.`,
      );
      return [{ text, paths: [path] }];
    }),
  );
}

/** The line of `accept` with the lessons it added; undefined without any. */
export function riskLessonsLine(ids: readonly string[], lang: Lang): string | undefined {
  if (ids.length === 0) return undefined;
  return translator(lang)(
    `Riesgos aceptados, anotados en la memoria como lecciones de sus archivos: ${ids.join(", ")}.`,
    `Accepted risks, added to the memory as lessons of their files: ${ids.join(", ")}.`,
  );
}
