// SPDX-License-Identifier: Apache-2.0
import {
  type Finding,
  type FunctionMetric,
  functionMetrics,
  isTestFile,
  translator,
} from "@baquia-dev/specty-core";
import type { Stack } from "../detect/stack";
import type { CheckContext, CheckDefinition, Provider } from "./provider";

/**
 * The size and the complexity of each function, by the core's own measure, the same for every
 * language with braces (ADR 0012). A function counts when the change touched it and it is past
 * the limit because of the change: new, or grown. One that was already past it and did not grow
 * is debt the change did not make; `--all` shows them all.
 */

type Measure = "lines" | "complexity";

/** A function as it is now, with its pair where the run starts, if it had one. */
interface Measured {
  readonly path: string;
  readonly now: FunctionMetric;
  readonly before?: FunctionMetric;
}

// The stacks whose language `functionMetrics` has no estimator for.
const UNMEASURED: ReadonlySet<Stack["language"]> = new Set(["elixir"]);

export const functionsProvider: Provider = {
  id: "functions",
  applies: (stacks) => stacks.some((stack) => !UNMEASURED.has(stack.language)),
  checks: [check("function-lines", "lines"), check("complexity", "complexity")],
};

function check(id: string, measure: Measure): CheckDefinition {
  return {
    id,
    async run(context) {
      const limit =
        measure === "lines"
          ? context.session.config.checks.functions.maxLines
          : context.session.config.checks.functions.complexity;
      const t = translator(context.session.lang);
      const findings = (await measured(context))
        .filter(({ path, now }) => touched(context, path, now))
        .filter(
          ({ now, before }) => now[measure] > limit && (before?.[measure] ?? 0) < now[measure],
        )
        .map(
          ({ path, now }): Finding => ({
            path,
            line: now.start,
            message: messageOf(measure, now, limit, t),
          }),
        );
      return { findings };
    },
  };
}

/** The functions of the run's files, each with its pair: same name, same place among them. */
async function measured(context: CheckContext): Promise<Measured[]> {
  const files = context.files.filter((path) => !isTestFile(path));
  const found = await Promise.all(
    files.map(async (path): Promise<Measured[]> => {
      const text = await context.read(path);
      if (text === undefined) return [];
      const before = await context.before(path);
      const then = before === undefined ? [] : functionMetrics(path, before);
      const current = functionMetrics(path, text);
      return current.map((now) => {
        const pair = now.name === undefined ? undefined : pairOf(now, current, then);
        return pair === undefined ? { path, now } : { path, now, before: pair };
      });
    }),
  );
  return found.flat();
}

function pairOf(
  now: FunctionMetric,
  current: readonly FunctionMetric[],
  then: readonly FunctionMetric[],
): FunctionMetric | undefined {
  const order = current.filter((other) => other.name === now.name).indexOf(now);
  return then.filter((other) => other.name === now.name)[order];
}

/** Some line of it, from its header to its closing brace, is one the change adds. */
function touched(context: CheckContext, path: string, metric: FunctionMetric): boolean {
  const added = context.added(path);
  if (added === undefined) return true;
  for (let line = metric.start; line <= metric.end; line += 1) {
    if (added.has(line)) return true;
  }
  return false;
}

function messageOf(
  measure: Measure,
  metric: FunctionMetric,
  limit: number,
  t: ReturnType<typeof translator>,
): string {
  const name = metric.name === undefined ? undefined : `\`${metric.name}\``;
  if (measure === "lines") {
    return name === undefined
      ? t(
          `una función de ${metric.lines} líneas de código (máximo ${limit})`,
          `a function with ${metric.lines} lines of code (max ${limit})`,
        )
      : t(
          `${name} tiene ${metric.lines} líneas de código (máximo ${limit})`,
          `${name} has ${metric.lines} lines of code (max ${limit})`,
        );
  }
  return name === undefined
    ? t(
        `una función de complejidad ${metric.complexity} (máximo ${limit})`,
        `a function with complexity ${metric.complexity} (max ${limit})`,
      )
    : t(
        `${name} tiene complejidad ${metric.complexity} (máximo ${limit})`,
        `${name} has complexity ${metric.complexity} (max ${limit})`,
      );
}
