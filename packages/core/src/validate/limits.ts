// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { ResolvedConfig } from "../schema/config";
import type { SizeLevel, SizeResult } from "../sizing/size";

export type Breach =
  | { readonly metric: "tasks" | "files" | "modules"; readonly value: number; readonly max: number }
  | { readonly metric: "level"; readonly value: SizeLevel };

export type QuickProblem =
  | { readonly kind: "tasks"; readonly value: number; readonly max: number }
  | { readonly kind: "files"; readonly value: number; readonly max: number }
  | { readonly kind: "sensitive" };

/** Thresholds a change exceeds (it must be split) or is close to. */
export function splitBreaches(
  size: SizeResult,
  config: ResolvedConfig,
): { readonly exceeded: readonly Breach[]; readonly near: readonly Breach[] } {
  const { split } = config;
  const metrics: readonly Breach[] = [
    { metric: "tasks", value: size.signals.tasks, max: split.maxTasks },
    { metric: "files", value: size.signals.codeFiles, max: split.maxFiles },
    { metric: "modules", value: size.signals.modules.length, max: split.maxModules },
  ];
  const over = metrics.filter((breach) => breach.metric !== "level" && breach.value > breach.max);
  const exceeded =
    size.level === "XL" ? [...over, { metric: "level", value: "XL" } as const] : over;
  const near = metrics.filter(
    (breach) =>
      breach.metric !== "level" &&
      breach.metric !== "modules" &&
      breach.value <= breach.max &&
      breach.value >= Math.ceil(breach.max * config.sizing.nearRatio),
  );
  return { exceeded, near };
}

export function formatBreach(breach: Breach, lang: Lang): string {
  const es = lang === "es";
  if (breach.metric === "level") return es ? `tamaño ${breach.value}` : `size ${breach.value}`;
  const nouns = {
    tasks: es ? "tareas" : "tasks",
    files: es ? "archivos de código" : "code files",
    modules: es ? "módulos" : "modules",
  };
  return `${breach.value} ${nouns[breach.metric]}, ${es ? "máximo" : "max"} ${breach.max}`;
}

export function formatQuickProblem(problem: QuickProblem, lang: Lang): string {
  const es = lang === "es";
  switch (problem.kind) {
    case "tasks": {
      const one = problem.max === 1;
      return es
        ? `${problem.value} tareas; quick admite ${one ? "una" : problem.max}`
        : `${problem.value} tasks; quick allows ${one ? "one" : problem.max}`;
    }
    case "files":
      return es
        ? `${problem.value} archivos de código, máximo ${problem.max}`
        : `${problem.value} code files, max ${problem.max}`;
    case "sensitive":
      return es ? "toca rutas sensibles" : "touches sensitive paths";
  }
}
