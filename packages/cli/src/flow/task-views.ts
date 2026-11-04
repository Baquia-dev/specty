// SPDX-License-Identifier: Apache-2.0
import {
  type AssertionLoss,
  type ChangeState,
  isRiskRule,
  type LongFile,
  type RiskFinding,
  recommendTaskEffort,
  type Spec,
  type Task,
  type TaskView,
  testRules,
} from "@baquia-dev/specty-core";
import { isRecord } from "../io/files";
import type { Session } from "../session";
import { type Audit, dataOf, findingsOf } from "./carried";

// The change's tasks as the cards show them: their verification, their commits and what
// `task done` recorded of each.

/**
 * What `task done` runs for a task, as one command: the repository's quick check, so a broken
 * rule shows up in the task that broke it, then the task's own verification or the default one.
 */
export function taskVerification(session: Session, task: Task): string | undefined {
  const { quick } = session.config.verify;
  const own = task.verify ?? session.config.verify.default;
  if (quick === undefined) return own;
  return own === undefined ? quick : `${quick} && ${own}`;
}

/** The spec's tasks as the cards show them, and the short SHA of each task's commit. */
export async function taskViews(
  session: Session,
  spec: Spec,
  state: ChangeState,
  audit: Audit,
): Promise<{
  readonly tasks: readonly TaskView[];
  readonly commits: ReadonlyMap<string, string>;
}> {
  const commits = await taskCommits(session, state.id);
  const records: TaskRecords = { commits, findings: findingsByTask(audit) };
  const tasks = (spec.sections.tasks?.items ?? []).map((task) =>
    taskView(session, spec, state, task, records),
  );
  return { tasks, commits };
}

/** What git and the audit hold of the change's tasks: each one's commit and what `task done` recorded. */
interface TaskRecords {
  readonly commits: ReadonlyMap<string, string>;
  readonly findings: ReadonlyMap<string, TaskFindings>;
}

/** A task as the cards show it: its spec, its state, its verification and what it recorded. */
function taskView(
  session: Session,
  spec: Spec,
  state: ChangeState,
  task: Task,
  records: TaskRecords,
): TaskView {
  const stored = state.tasks[task.id];
  const verify = taskVerification(session, task);
  const commit = records.commits.get(task.id);
  const rules = testRules(task, session.config.policy.tests);
  return {
    id: task.id,
    title: task.title,
    status: stored?.status ?? "pending",
    files: task.files,
    extras: stored?.scopeExtra ?? [],
    criteria: criteriaOf(spec, task.ac),
    effort: recommendTaskEffort(task, session.config),
    ...(verify !== undefined ? { verify } : {}),
    ...(stored?.summary !== undefined ? { summary: stored.summary } : {}),
    ...(commit !== undefined ? { commit } : {}),
    ...(rules !== undefined ? { testRules: rules } : {}),
    ...recordedFindings(records.findings.get(task.id)),
  };
}

/** What `task done` recorded of a task, only the kinds there are. */
function recordedFindings(
  found: TaskFindings | undefined,
): Pick<TaskView, "removedAssertions" | "risks" | "findings" | "longFiles"> {
  const { lost, risks, notes, long } = found ?? { lost: [], risks: [], notes: [], long: [] };
  return {
    ...(lost.length > 0 ? { removedAssertions: lost } : {}),
    ...(risks.length > 0 ? { risks } : {}),
    ...(notes.length > 0 ? { findings: notes } : {}),
    ...(long.length > 0 ? { longFiles: long } : {}),
  };
}

interface TaskFindings {
  readonly lost: readonly AssertionLoss[];
  readonly risks: readonly RiskFinding[];
  /** What the agent learned (`--finding`). */
  readonly notes: readonly string[];
  readonly long: readonly LongFile[];
}

/** What `task done` recorded of each task: removed assertions, risks, findings and long files. */
function findingsByTask(audit: Audit): ReadonlyMap<string, TaskFindings> {
  const notes = findingsOf(audit);
  return new Map(
    audit
      .filter((entry) => entry.event === "task.completed")
      .flatMap((entry): [string, TaskFindings][] => {
        const { task, removedAssertions, risks, longFiles } = dataOf(entry);
        if (typeof task !== "string") return [];
        const learned = notes.filter((note) => note.task === task).map((note) => note.text);
        const lost = listOf(removedAssertions).flatMap((loss) =>
          typeof loss.path === "string" && typeof loss.removed === "number"
            ? [{ path: loss.path, removed: loss.removed }]
            : [],
        );
        const found = listOf(risks).flatMap((risk): RiskFinding[] =>
          typeof risk.path === "string" && isRiskRule(risk.rule)
            ? [
                {
                  path: risk.path,
                  rule: risk.rule,
                  ...(typeof risk.cwe === "string" ? { cwe: risk.cwe } : {}),
                  ...(typeof risk.line === "number" ? { line: risk.line } : {}),
                },
              ]
            : [],
        );
        const long = listOf(longFiles).flatMap((file): LongFile[] =>
          typeof file.path === "string" &&
          typeof file.lines === "number" &&
          typeof file.before === "number" &&
          typeof file.limit === "number"
            ? [
                {
                  path: file.path,
                  lines: file.lines,
                  before: file.before,
                  limit: file.limit,
                  severity: "warning",
                },
              ]
            : [],
        );
        return [[task, { lost, risks: found, notes: learned, long }]];
      }),
  );
}

function listOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item: unknown) => isRecord(item)) : [];
}

function criteriaOf(spec: Spec, ac: readonly string[] | "none" | undefined): TaskView["criteria"] {
  if (ac === undefined || ac === "none") return [];
  const criteria = spec.sections.criteria?.items ?? [];
  return ac.flatMap((id) =>
    criteria
      .filter((criterion) => criterion.id === id)
      .map(({ id: _id, text, test }) => ({
        id,
        text,
        ...(test === "manual" ? { manual: true } : {}),
      })),
  );
}

/** Short SHA of each task's commit, found through the `Specty-Task` trailer. */
export async function taskCommits(
  session: Session,
  changeId: string,
): Promise<ReadonlyMap<string, string>> {
  const result = await session.git.run([
    "log",
    "-n",
    "500",
    "--format=%h%x1f%(trailers:key=Specty-Change,valueonly,separator=%x2C)%x1f%(trailers:key=Specty-Task,valueonly,separator=%x2C)",
  ]);
  if (result.code !== 0) return new Map();
  const pairs = result.stdout.split("\n").flatMap((line): [string, string][] => {
    const [sha, change, task] = line.split("\x1f").map((part) => part.trim());
    return sha !== undefined && change === changeId && task !== undefined && task.length > 0
      ? [[task, sha]]
      : [];
  });
  return new Map(pairs.toReversed());
}
