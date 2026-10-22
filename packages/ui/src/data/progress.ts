// SPDX-License-Identifier: Apache-2.0
// The progress of a change's tasks (docs/ui.md, Progreso): the spec's tasks joined with their
// state and their verifications. Only types come from core, so screens may import the helpers.
import type { ChangeState, Lang, Spec } from "@baquia-dev/specty-core";

/** A line of `audit.jsonl` (formats.md §4), as the data source gives it. */
export interface AuditRecord {
  readonly ts: string;
  readonly actor: "agent" | "human" | "specty";
  readonly tool?: string;
  readonly event: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export type TaskStatus = "pending" | "active" | "done";

/** One run of a task's verification command (`task.verified`). */
export interface VerificationView {
  readonly at: string;
  readonly command: string;
  readonly passed: boolean;
  readonly ms: number;
  /** Only a failed verification keeps its last lines. */
  readonly output: readonly string[];
}

/** A scope request still waiting for the person. */
export interface TaskScopeRequest {
  readonly id: string;
  readonly paths: readonly string[];
  readonly reason: string;
}

export interface TaskProgressView {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly summary?: string;
  readonly commit?: string;
  readonly files: readonly string[];
  readonly criteria: readonly string[];
  readonly attempts: number;
  readonly startedAt?: string;
  readonly doneAt?: string;
  /** The last run of its verification, if it ran. */
  readonly verification?: VerificationView;
  readonly scopeRequests: readonly TaskScopeRequest[];
}

export interface ProgressView {
  readonly tasks: readonly TaskProgressView[];
}

/** A `task.verified` event read with care: the audit is data from disk, not a promise. */
function verificationOf(record: AuditRecord): (VerificationView & { task: string }) | undefined {
  if (record.event !== "task.verified") return undefined;
  const { task, cmd, exit, ms, outputTail } = record.data;
  if (typeof task !== "string" || typeof cmd !== "string") return undefined;
  const output = Array.isArray(outputTail)
    ? outputTail.filter((line): line is string => typeof line === "string")
    : [];
  return {
    task,
    at: record.ts,
    command: cmd,
    passed: exit === 0,
    ms: typeof ms === "number" ? ms : 0,
    output,
  };
}

/** The spec's tasks in their order, with what Specty knows of each. */
export function progressOf(
  spec: Spec,
  state: ChangeState,
  audit: readonly AuditRecord[],
): ProgressView {
  const verifications = audit.flatMap((record) => verificationOf(record) ?? []);
  const tasks = (spec.sections.tasks?.items ?? []).map((task): TaskProgressView => {
    const stored = state.tasks[task.id];
    const last = verifications.filter((run) => run.task === task.id).at(-1);
    return {
      id: task.id,
      title: task.title,
      status: stored?.status ?? (task.done ? "done" : "pending"),
      ...(stored?.summary === undefined ? {} : { summary: stored.summary }),
      ...(stored?.commit === undefined ? {} : { commit: stored.commit }),
      files: task.files,
      criteria: task.ac === undefined || task.ac === "none" ? [] : task.ac,
      attempts: stored?.attempts ?? 0,
      ...(stored?.startedAt === undefined ? {} : { startedAt: stored.startedAt }),
      ...(stored?.doneAt === undefined ? {} : { doneAt: stored.doneAt }),
      ...(last === undefined
        ? {}
        : {
            verification: {
              at: last.at,
              command: last.command,
              passed: last.passed,
              ms: last.ms,
              output: last.output,
            },
          }),
      scopeRequests: state.pending.scopeRequests
        .filter((request) => request.task === task.id)
        .map(({ id, paths, reason }) => ({ id, paths, reason })),
    };
  });
  return { tasks };
}

/** How long a task took, or has taken so far; nothing before it starts. */
export function taskElapsed(task: TaskProgressView, now: number): number | undefined {
  if (task.startedAt === undefined) return undefined;
  const end = task.doneAt === undefined ? now : Date.parse(task.doneAt);
  return Math.max(0, end - Date.parse(task.startedAt));
}

/** The time spent on the tasks: the done ones and the one in progress. */
export function workTime(progress: ProgressView, now: number): number {
  return progress.tasks.reduce((sum, task) => sum + (taskElapsed(task, now) ?? 0), 0);
}

/** «18 s» for a verification, «14 min» or «1 h 5 min» for a task. */
export function formatDuration(ms: number, lang: Lang): string {
  if (ms < 60_000) {
    if (ms < 1_000) return lang === "es" ? "menos de 1 s" : "under 1 s";
    return `${Math.round(ms / 1_000)} s`;
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
