// SPDX-License-Identifier: Apache-2.0
// The agent's work, simulated for the sample source: a verification printing line by line, the
// way `specty task done` will stream it, and a task finished. Run from the palette, without the CLI.
import type { ChangeState } from "@baquia-dev/specty-core";
import type { AuditRecord, RunRecord } from "./progress";
import type { ChangeRecord } from "./records";

/** One line every so often: slow enough to watch it scroll. */
export const STEP_MS = 350;

/** What to verify: the task in progress of a change, and whether it will pass. */
export interface RunTarget {
  readonly change: string;
  readonly task: string;
  readonly command: string;
  readonly passes: boolean;
  /** The path a pending scope request asks for: without it, the run fails. */
  readonly missing?: string;
}

type Listener = (run: RunRecord | undefined) => void;

/** The task in progress of a change, if any. */
export function activeTask(state: ChangeState): string | undefined {
  return Object.entries(state.tasks).find(([, task]) => task.status === "active")?.[0];
}

/** The agent can finish its task: in progress, with no scope request waiting. */
export function canFinishTask(state: ChangeState): boolean {
  return (
    state.phase === "implementing" &&
    state.pending.scopeRequests.length === 0 &&
    activeTask(state) !== undefined
  );
}

/** The task in progress done; with none left, the change moves on to acceptance. */
export function finishTaskIn(state: ChangeState): ChangeState {
  const id = activeTask(state);
  const task = id === undefined ? undefined : state.tasks[id];
  if (id === undefined || task === undefined) return state;
  const tasks = { ...state.tasks, [id]: { ...task, status: "done" as const } };
  const left = Object.values(tasks).some((entry) => entry.status !== "done");
  return { ...state, tasks, phase: left ? state.phase : "acceptance" };
}

/**
 * The first change being implemented with a task in progress. That task fails while it waits for
 * a scope request, as it would without the file it asked for, and passes otherwise.
 */
export function runTarget(records: readonly ChangeRecord[]): RunTarget | undefined {
  for (const { state, audit } of records) {
    const task = state.phase === "implementing" ? activeTask(state) : undefined;
    if (task === undefined) continue;
    const request = state.pending.scopeRequests.find((entry) => entry.task === task);
    const used = (audit ?? []).flatMap((event) =>
      event.event === "task.verified" && typeof event.data.cmd === "string" ? [event.data.cmd] : [],
    );
    return {
      change: state.id,
      task,
      command: used.at(-1) ?? "flutter test",
      passes: request === undefined,
      ...(request?.paths[0] === undefined ? {} : { missing: request.paths[0] }),
    };
  }
  return undefined;
}

/** The lines a test runner prints, ending in a pass or in a failure. */
function script(target: RunTarget): readonly string[] {
  const where = target.command.split(" ").at(-1) ?? "test";
  const opening = [
    `00:00 +0: loading ${where}`,
    "00:01 +0: renders the screen",
    "00:02 +1: shows the data of the course",
    "00:02 +2: keeps the layout on a phone",
    "00:03 +3: reads the labels in Spanish and English",
    "00:04 +4: saves the result",
    "00:05 +5: shows the signature",
  ];
  if (target.passes) return [...opening, "00:06 +6: All tests passed!"];
  return [
    ...opening,
    "00:06 +5 -1: shows the signature [E]",
    `  Error: Couldn't resolve '${target.missing ?? "a file outside the scope"}'.`,
    "  lib/reports/pdf/report_card.dart:12:8",
    "00:06 +5 -1: Some tests failed.",
  ];
}

/** What a finished run leaves: one more attempt and its `task.verified` event. */
export function verifiedIn(
  record: ChangeRecord,
  run: RunRecord,
  passed: boolean,
  now: number,
): ChangeRecord {
  const { state } = record;
  const task = state.tasks[run.task];
  const event: AuditRecord = {
    ts: new Date(now).toISOString(),
    actor: "specty",
    event: "task.verified",
    data: {
      task: run.task,
      cmd: run.command,
      exit: passed ? 0 : 1,
      ms: Math.max(0, now - Date.parse(run.startedAt)),
      ...(passed ? {} : { outputTail: run.output.slice(-10) }),
    },
  };
  const tasks =
    task === undefined
      ? state.tasks
      : { ...state.tasks, [run.task]: { ...task, attempts: task.attempts + 1 } };
  return { ...record, state: { ...state, tasks }, audit: [...(record.audit ?? []), event] };
}

/** Runs in progress, one per change, each printing a line every `STEP_MS`. */
export class RunSimulation {
  private readonly running = new Map<
    string,
    {
      run: RunRecord;
      lines: readonly string[];
      passes: boolean;
      timer: ReturnType<typeof setInterval>;
    }
  >();
  private readonly listeners = new Map<string, Set<Listener>>();

  /** `done` gets each run when it ends, to leave its result in the record. */
  constructor(private readonly done: (change: string, run: RunRecord, passed: boolean) => void) {}

  watch(change: string, listener: Listener): () => void {
    const listeners = this.listeners.get(change) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(change, listeners);
    listener(this.running.get(change)?.run);
    return () => listeners.delete(listener);
  }

  /** Starts verifying `target`; a change already verifying goes on with its run. */
  start(target: RunTarget, now: number = Date.now()): void {
    if (this.running.has(target.change)) return;
    const run: RunRecord = {
      task: target.task,
      command: target.command,
      startedAt: new Date(now).toISOString(),
      output: [],
    };
    const timer = setInterval(() => this.step(target.change), STEP_MS);
    this.running.set(target.change, { run, lines: script(target), passes: target.passes, timer });
    this.emit(target.change);
  }

  /** One more line; after the last, the result. */
  private step(change: string): void {
    const current = this.running.get(change);
    if (current === undefined) return;
    const { run, lines } = current;
    const next = lines[run.output.length];
    if (next !== undefined) {
      this.running.set(change, { ...current, run: { ...run, output: [...run.output, next] } });
    } else {
      clearInterval(current.timer);
      this.running.delete(change);
      this.done(change, run, current.passes);
    }
    this.emit(change);
  }

  private emit(change: string): void {
    const run = this.running.get(change)?.run;
    for (const listener of this.listeners.get(change) ?? []) listener(run);
  }
}
