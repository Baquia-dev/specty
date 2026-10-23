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

/**
 * A verification running now (`specty task done` checking a task, or the full verification before
 * accepting), as the source streams it: apart from the derived views, since it changes with every
 * line.
 */
export interface RunRecord {
  /** The task it checks; none for the full verification (`verify.full`). */
  readonly task?: string;
  readonly command: string;
  readonly startedAt: string;
  /** Every line so far, oldest first. */
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

/** The project's full verification (`verify.full`): its command and its last run, if any. */
export interface FullVerificationView {
  readonly command: string;
  readonly last?: VerificationView;
}

export interface ProgressView {
  readonly tasks: readonly TaskProgressView[];
  /** Only when the project has a full verification. */
  readonly full?: FullVerificationView;
}

/** A verification event read with care: the audit is data from disk, not a promise. */
function runOf(record: AuditRecord): VerificationView | undefined {
  const { cmd, exit, ms, outputTail } = record.data;
  if (typeof cmd !== "string") return undefined;
  const output = Array.isArray(outputTail)
    ? outputTail.filter((line): line is string => typeof line === "string")
    : [];
  return {
    at: record.ts,
    command: cmd,
    passed: exit === 0,
    ms: typeof ms === "number" ? ms : 0,
    output,
  };
}

/** A `task.verified` event, with the task it checked. */
function verificationOf(record: AuditRecord): (VerificationView & { task: string }) | undefined {
  if (record.event !== "task.verified") return undefined;
  const { task } = record.data;
  const run = runOf(record);
  return typeof task === "string" && run !== undefined ? { ...run, task } : undefined;
}

/**
 * The spec's tasks in their order, with what Specty knows of each; and, when the project has a
 * full verification (`verifyFull`), its last `change.verified`.
 */
export function progressOf(
  spec: Spec,
  state: ChangeState,
  audit: readonly AuditRecord[],
  verifyFull?: string,
): ProgressView {
  const verifications = audit.flatMap((record) => verificationOf(record) ?? []);
  const lastFull = audit
    .flatMap((record) => (record.event === "change.verified" ? (runOf(record) ?? []) : []))
    .at(-1);
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
  if (verifyFull === undefined) return { tasks };
  return {
    tasks,
    full: { command: verifyFull, ...(lastFull === undefined ? {} : { last: lastFull }) },
  };
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

/** What a piece of a verification's output means, by the marks test runners print. */
export type OutputTone = "plain" | "pass" | "fail" | "path" | "muted";

export interface OutputSegment {
  readonly text: string;
  readonly tone: OutputTone;
}

/** Marks inside a line; at one place, the first alternative wins. */
const MARKS = new RegExp(
  [
    String.raw`(?<muted>^\d{2}:\d{2}(?::\d{2})?)`,
    String.raw`(?<path>[\w@./-]+\.[A-Za-z]\w*:\d+(?::\d+)?)`,
    String.raw`(?<fail>\[E\]|✗|×|\bFAIL(?:ED)?\b|\b[Ee]rror\b|\bException\b|\bfailed\b|(?<![\w+-])-\d+\b)`,
    String.raw`(?<pass>✓|\bPASS(?:ED)?\b|All tests passed!?|\bpassed\b|(?<![\w+-])\+\d+\b)`,
  ].join("|"),
  "gu",
);

/**
 * A line of output in pieces with their tone (A6): failures in red, passes in green, locations
 * in blue, timings muted; what is not recognized stays plain. The text is kept whole.
 */
export function outputSegments(line: string): readonly OutputSegment[] {
  if (/^\s*(?:Actual|Received):/.test(line)) return [{ text: line, tone: "fail" }];
  if (/^\s*Expected:/.test(line)) return [{ text: line, tone: "pass" }];
  const segments: OutputSegment[] = [];
  let at = 0;
  for (const match of line.matchAll(MARKS)) {
    const start = match.index;
    if (start > at) segments.push({ text: line.slice(at, start), tone: "plain" });
    const groups = match.groups ?? {};
    const tone = (["muted", "path", "fail", "pass"] as const).find(
      (name) => groups[name] !== undefined,
    );
    segments.push({ text: match[0], tone: tone ?? "plain" });
    at = start + match[0].length;
  }
  if (at < line.length) segments.push({ text: line.slice(at), tone: "plain" });
  return segments;
}

/** «0:42», «12:05», «1:05:30»: how long something has been running, second by second. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
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
