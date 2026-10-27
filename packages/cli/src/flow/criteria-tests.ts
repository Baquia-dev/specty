// SPDX-License-Identifier: Apache-2.0
import { criterionMarks, isTestFile, type Task, testRules } from "@baquia-dev/specty-core";
import type { LoadedPlan } from "../check/plan";
import type { CheckContext } from "../check/provider";

/**
 * Each criterion is checked by a test that carries its id (ADR 0014): the lines of the tests
 * with an id, as `criterionMarks` of the core finds them.
 */

/** A criterion that owes a test, with the tasks that cover it. */
export interface UntestedCriterion {
  readonly id: string;
  readonly tasks: readonly string[];
}

/**
 * The criteria of the `feat` and `fix` tasks being worked on, or done, that no test line the run
 * adds carries, in the spec's order; never one with `test: manual`, and none with
 * `policy.tests: off`. With `--staged`, a task already done made its commit, so only the active
 * one counts.
 */
export async function untestedCriteria(
  plan: LoadedPlan,
  context: CheckContext,
): Promise<readonly UntestedCriterion[]> {
  const owed = owedCriteria(plan, context);
  const tested = await testedIds(
    context,
    owed.map((criterion) => criterion.id),
  );
  return owed.filter((criterion) => !tested.has(criterion.id));
}

function owedCriteria(plan: LoadedPlan, { session, mode }: CheckContext): UntestedCriterion[] {
  const tasks = (plan.spec.sections.tasks?.items ?? []).filter((task) => {
    const status = plan.state.tasks[task.id]?.status;
    return (
      testRules(task, session.config.policy.tests) === "first" &&
      (status === "active" || (status === "done" && mode !== "staged"))
    );
  });
  return (plan.spec.sections.criteria?.items ?? [])
    .filter((criterion) => criterion.test !== "manual")
    .map((criterion) => ({
      id: criterion.id,
      tasks: tasks.filter((task) => covers(task, criterion.id)).map((task) => task.id),
    }))
    .filter((criterion) => criterion.tasks.length > 0);
}

function covers(task: Task, id: string): boolean {
  return task.ac !== undefined && task.ac !== "none" && task.ac.includes(id);
}

/** The ids of `ids` that a line the run adds to a test file carries. */
async function testedIds(context: CheckContext, ids: readonly string[]): Promise<Set<string>> {
  const found = await Promise.all(
    context.files.filter(isTestFile).map(async (path) => {
      const text = await context.read(path);
      if (text === undefined) return [];
      const added = context.added(path);
      return criterionMarks(text, ids)
        .filter((mark) => added === undefined || added.has(mark.line))
        .map((mark) => mark.marker);
    }),
  );
  return new Set(found.flat());
}
