// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type ChangeView,
  criterionMarks,
  isTestFile,
  type Spec,
  type Task,
  type TestsPolicy,
  testRules,
} from "@baquia-dev/specty-core";
import type { LoadedPlan } from "../check/plan";
import type { CheckContext } from "../check/provider";
import { readText } from "../io/files";
import type { Session } from "../session";

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

/**
 * In the testing phase, the ids of the criteria of every `feat` and `fix` task that no test line
 * the change adds carries yet: the tests come before the code (ADR 0014).
 */
export async function untestedBeforeCode(
  spec: Spec,
  context: CheckContext,
): Promise<readonly string[]> {
  const owed = owedBy(spec, owingTasks(spec, context.session.config.policy.tests)).map(
    (criterion) => criterion.id,
  );
  const tested = await testedIds(context, owed);
  return owed.filter((id) => !tested.has(id));
}

function owedCriteria(plan: LoadedPlan, { session, mode }: CheckContext): UntestedCriterion[] {
  const tasks = owingTasks(plan.spec, session.config.policy.tests).filter((task) => {
    const status = plan.state.tasks[task.id]?.status;
    return status === "active" || (status === "done" && mode !== "staged");
  });
  return owedBy(plan.spec, tasks);
}

/** The criteria of `spec` that `tasks` cover and that a test checks: not `test: manual`. */
function owedBy(spec: Spec, tasks: readonly Task[]): UntestedCriterion[] {
  return (spec.sections.criteria?.items ?? [])
    .filter((criterion) => criterion.test !== "manual")
    .map((criterion) => ({
      id: criterion.id,
      tasks: tasks.filter((task) => covers(task, criterion.id)).map((task) => task.id),
    }))
    .filter((criterion) => criterion.tasks.length > 0);
}

/** The tasks whose criteria owe a test: `feat` and `fix`, the ones the card asks for it first. */
function owingTasks(spec: Spec, policy: TestsPolicy): Task[] {
  return (spec.sections.tasks?.items ?? []).filter((task) => testRules(task, policy) === "first");
}

function covers(task: Task, id: string): boolean {
  return task.ac !== undefined && task.ac !== "none" && task.ac.includes(id);
}

type CriterionTests = NonNullable<ChangeView["criteriaTests"]>[number];
type TestLine = CriterionTests["tests"][number] & { readonly id: string };

/**
 * In acceptance, each criterion of `spec` with the test lines that carry its id: in the test
 * files the commits of the tasks (`commits`, by task) touched, only the lines one of those
 * commits added, by `git blame`; a line from the main branch or by hand does not count.
 */
export async function criteriaTests(
  session: Session,
  spec: Spec,
  commits: ReadonlyMap<string, string>,
): Promise<CriterionTests[]> {
  const criteria = spec.sections.criteria?.items ?? [];
  const lines = await taskTestLines(
    session,
    criteria.map((criterion) => criterion.id),
    commits,
  );
  const owing = owingTasks(spec, session.config.policy.tests);
  return criteria.map((criterion) => ({
    id: criterion.id,
    manual: criterion.test === "manual",
    owed: owing.some((task) => covers(task, criterion.id)),
    tests: lines.filter((line) => line.id === criterion.id).map(({ id: _id, ...test }) => test),
  }));
}

/** The lines with an id that a task's commit added to a test file it touched. */
async function taskTestLines(
  session: Session,
  ids: readonly string[],
  commits: ReadonlyMap<string, string>,
): Promise<TestLine[]> {
  if (ids.length === 0 || commits.size === 0) return [];
  const shown = await session.git.run(["show", "--name-only", "--format=", ...commits.values()]);
  if (shown.code !== 0) return [];
  const files = new Set(shown.stdout.split("\n").filter((path) => path !== "" && isTestFile(path)));
  const found = await Promise.all(
    [...files].toSorted().map((path) => fileTestLines(session, path, ids, commits)),
  );
  return found.flat();
}

/** Blames `path` only when it has an id, once (R1). */
async function fileTestLines(
  session: Session,
  path: string,
  ids: readonly string[],
  commits: ReadonlyMap<string, string>,
): Promise<TestLine[]> {
  const text = await readText(join(session.root, path));
  const marks = text === undefined ? [] : criterionMarks(text, ids);
  if (marks.length === 0) return [];
  const blamed = await blame(session, path);
  return marks.flatMap((mark): TestLine[] => {
    const sha = blamed.get(mark.line);
    const task = [...commits].find(([, short]) => sha?.startsWith(short) === true);
    if (task === undefined) return [];
    const [id, commit] = task;
    return [{ id: mark.marker, path, line: mark.line, task: id, commit }];
  });
}

/** The commit of each line of `path` as it is on disk, from 1; a line not committed has none. */
async function blame(session: Session, path: string): Promise<ReadonlyMap<number, string>> {
  const result = await session.git.run(["blame", "--porcelain", "--", path]);
  if (result.code !== 0) return new Map();
  return new Map(
    result.stdout.split("\n").flatMap((line): [number, string][] => {
      const [, sha, final] = /^([0-9a-f]{40,64}) \d+ (\d+)/.exec(line) ?? [];
      return sha === undefined || final === undefined ? [] : [[Number(final), sha]];
    }),
  );
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
