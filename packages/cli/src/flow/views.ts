// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type AssertionLoss,
  type ChangeView,
  dirname,
  isIntegrating,
  isRiskRule,
  type LongFile,
  parseSpec,
  type RiskFinding,
  recommendTaskEffort,
  type Spec,
  specHash,
  type Task,
  type TaskView,
  testRules,
} from "@baquia-dev/specty-core";
import { exists, isRecord } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { readComments } from "../store/comments";
import { type Audit, carriedOf, dataOf, findingsOf, readAudit } from "./carried";
import { sliceViews } from "./epic";

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

/** Everything the cards need about a change, read from its files and from git. */
export async function changeView(session: Session, change: StoredChange): Promise<ChangeView> {
  const { state } = change;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const commits = await taskCommits(session, state.id);
  const audit = await readAudit(change.files);
  const findings = findingsByTask(audit);
  const tasks = (spec.sections.tasks?.items ?? []).map((task): TaskView => {
    const stored = state.tasks[task.id];
    const verify = taskVerification(session, task);
    const commit = commits.get(task.id);
    const rules = testRules(task, session.config.policy.tests);
    const { lost, risks, notes, long } = findings.get(task.id) ?? {
      lost: [],
      risks: [],
      notes: [],
      long: [],
    };
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
      ...(lost.length > 0 ? { removedAssertions: lost } : {}),
      ...(risks.length > 0 ? { risks } : {}),
      ...(notes.length > 0 ? { findings: notes } : {}),
      ...(long.length > 0 ? { longFiles: long } : {}),
    };
  });
  const active = tasks.find((task) => task.status === "active");
  const assumptions = spec.sections.assumptions?.items ?? [];
  return {
    id: state.id,
    kind: state.kind,
    phase: state.phase,
    title: spec.title,
    specPath: session.paths.relative(change.files.spec),
    ...(state.branch !== undefined ? { branch: state.branch } : {}),
    revision: state.revision,
    tasks,
    conventions:
      active === undefined ? [] : await conventions(session, [...active.files, ...active.extras]),
    pendingScope: state.pending.scopeRequests,
    rejected: assumptions.flatMap((item) => {
      const decision = state.items[item.id];
      if (decision?.decision !== "rejected") return [];
      return [
        {
          id: item.id,
          text: item.text,
          ...(decision.comment !== undefined ? { comment: decision.comment } : {}),
        },
      ];
    }),
    requested: state.phase === "review" ? await requested(change, audit) : [],
    ...(state.pending.adjustment !== null ? { adjustment: state.pending.adjustment.request } : {}),
    ...(state.phase === "draft" ? request(audit) : {}),
    ...(state.phase === "draft" ? await carriedOf(session, spec.frontmatter.follows) : {}),
    ...(state.phase === "acceptance" && resultReview(session, change, tasks, audit)
      ? { recommendReview: true }
      : {}),
    closingSubmitted: state.closingSubmittedAt !== undefined,
    specChanged:
      state.phase === "implementing" &&
      state.approved !== undefined &&
      specHash(spec) !== state.approved.hash,
    ...(state.integration !== undefined && isIntegrating(state)
      ? {
          integration: {
            target: state.integration.target,
            reason: state.integration.reason,
            conflicts: state.integration.conflicts,
            paths: state.integration.paths,
          },
        }
      : {}),
    ...(state.kind === "epic" ? { slices: await sliceViews(session, change, spec) } : {}),
  };
}

/**
 * The unresolved comments the agent must answer: only once the person asked for changes after
 * the last proposal; until then, the review is still theirs.
 */
async function requested(
  change: StoredChange,
  audit: Audit,
): Promise<NonNullable<ChangeView["requested"]>> {
  const last = audit.findLast(
    (entry) => entry.event === "spec.proposed" || entry.event === "review.changes_requested",
  );
  if (last?.event !== "review.changes_requested") return [];
  return (await readComments(change.files))
    .filter((comment) => comment.resolvedInRevision === undefined)
    .map(({ id, anchor, body }) => ({ id, anchor, body }));
}

/** The user's literal request, from the audit, where `new --request` left it. */
function request(audit: Audit): Pick<ChangeView, "request"> {
  const data = dataOf(audit.find((entry) => entry.event === "change.created"));
  return typeof data.request === "string" ? { request: data.request } : {};
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

/**
 * An independent review of the result (ADR 0011) comes before the acceptance of a large change,
 * or of one whose tasks removed assertions or added risks, until one follows its last task.
 */
function resultReview(
  session: Session,
  change: StoredChange,
  tasks: readonly TaskView[],
  audit: Audit,
): boolean {
  if (session.config.review === undefined) return false;
  const level = change.state.size?.level;
  const warned = tasks.some(
    (task) => (task.risks?.length ?? 0) > 0 || (task.removedAssertions?.length ?? 0) > 0,
  );
  if (level !== "L" && level !== "XL" && !warned) return false;
  const lastTask = audit.findLastIndex((entry) => entry.event === "task.completed");
  const lastReview = audit.findLastIndex(
    (entry) => entry.event === "review.completed" && dataOf(entry).target === "diff",
  );
  return lastReview < lastTask;
}

function criteriaOf(spec: Spec, ac: readonly string[] | "none" | undefined): TaskView["criteria"] {
  if (ac === undefined || ac === "none") return [];
  const criteria = spec.sections.criteria?.items ?? [];
  return ac.flatMap((id) => criteria.filter((criterion) => criterion.id === id));
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

/** Nested AGENTS.md files that apply to the given paths, closest last. */
async function conventions(session: Session, files: readonly string[]): Promise<string[]> {
  const directories = new Set(files.flatMap((file) => ancestors(dirname(file))));
  const candidates = [...directories].toSorted().map((directory) => `${directory}/AGENTS.md`);
  const found = await Promise.all(
    candidates.map(async (candidate) =>
      (await exists(join(session.root, candidate))) ? [candidate] : [],
    ),
  );
  return found.flat();
}

function ancestors(directory: string): string[] {
  if (directory === "" || directory === "." || /[*?[{]/.test(directory)) return [];
  return [...ancestors(dirname(directory)), directory];
}
