// SPDX-License-Identifier: Apache-2.0
// The agent's work, simulated for the sample source: a verification printing line by line, the
// way `specty task done` will stream it, and a task finished. Run from the palette, without the CLI.
import type { ChangeState } from "@baquia-dev/specty-core";
import type { AuditRecord, RunRecord } from "./progress";
import { ActionError, type ChangeRecord } from "./records";

/** One line every so often: slow enough to watch it scroll. */
export const STEP_MS = 350;

/** What to verify: the task in progress of a change, or all of it, and whether it will pass. */
export interface RunTarget {
  readonly change: string;
  /** None for the full verification. */
  readonly task?: string;
  readonly command: string;
  readonly passes: boolean;
  /** The path a pending scope request asks for: without it, the run fails. */
  readonly missing?: string;
}

type Listener = (run: RunRecord | undefined) => void;

/** The task in progress of a change, if any. */
function activeTask(state: ChangeState): string | undefined {
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

/**
 * The full verification of a change: only in acceptance, with `verify.full` configured, and
 * when nothing else is verifying it. The source explains why it does not start.
 */
export function fullTarget(
  record: ChangeRecord | undefined,
  passes: boolean,
  busy: boolean,
): RunTarget {
  const refuse = (es: string, en: string) => new ActionError({ es, en });
  if (record === undefined) throw refuse("Ese cambio no existe.", "That change does not exist.");
  const { state, verifyFull } = record;
  if (verifyFull === undefined) {
    throw refuse(
      "El proyecto no tiene verificación completa (verify.full en config.yaml).",
      "The project has no full verification (verify.full in config.yaml).",
    );
  }
  if (state.phase !== "acceptance") {
    throw refuse(
      "La verificación completa se ejecuta en la aceptación.",
      "The full verification runs during acceptance.",
    );
  }
  if (busy) {
    throw refuse(
      "Ya hay una verificación en curso en este cambio: espera a que termine.",
      "A verification is already running in this change: wait for it to end.",
    );
  }
  return { change: state.id, command: verifyFull, passes };
}

/** `flutter analyze && flutter test` over the whole project; a failure lands in another module. */
function fullScript(passes: boolean): readonly string[] {
  const opening = [
    "Analyzing mi_colegio...",
    "No issues found! (ran in 3.1s)",
    "00:00 +0: loading test/attendance/attendance_repository_test.dart",
    "00:02 +6: attendance repository weekly percentage per course",
    "00:04 +14: course panel highlights students over three absences",
  ];
  if (passes) {
    return [
      ...opening,
      "00:07 +25: reports keep their totals",
      "00:09 +33: auth signs in with Google",
      "00:11 +41: All tests passed!",
    ];
  }
  return [
    ...opening,
    "00:07 +24 -1: reports keep their totals [E]",
    "  Expected: <31>",
    "    Actual: <30>",
    "  test/reports/totals_test.dart:48:7",
    "00:09 +32 -1: auth signs in with Google",
    "00:11 +40 -1: Some tests failed.",
  ];
}

/** The lines a test runner prints, ending in a pass or in a failure. */
function script(target: RunTarget): readonly string[] {
  if (target.task === undefined) return fullScript(target.passes);
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

/**
 * What a finished run leaves: a task's, one more attempt and its `task.verified` event; the full
 * verification, its `change.verified` event.
 */
export function verifiedIn(
  record: ChangeRecord,
  run: RunRecord,
  passed: boolean,
  now: number,
): ChangeRecord {
  const { state } = record;
  const result = {
    cmd: run.command,
    exit: passed ? 0 : 1,
    ms: Math.max(0, now - Date.parse(run.startedAt)),
    ...(passed ? {} : { outputTail: run.output.slice(-10) }),
  };
  const ts = new Date(now).toISOString();
  const audit = record.audit ?? [];
  if (run.task === undefined) {
    const event: AuditRecord = { ts, actor: "specty", event: "change.verified", data: result };
    return { ...record, audit: [...audit, event] };
  }
  const task = state.tasks[run.task];
  const event: AuditRecord = {
    ts,
    actor: "specty",
    event: "task.verified",
    data: { task: run.task, ...result },
  };
  const tasks =
    task === undefined
      ? state.tasks
      : { ...state.tasks, [run.task]: { ...task, attempts: task.attempts + 1 } };
  return { ...record, state: { ...state, tasks }, audit: [...audit, event] };
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

  /** Something is verifying `change` now. */
  busy(change: string): boolean {
    return this.running.has(change);
  }

  /** Starts verifying `target`; a change already verifying goes on with its run. */
  start(target: RunTarget, now: number = Date.now()): void {
    if (this.running.has(target.change)) return;
    const run: RunRecord = {
      ...(target.task === undefined ? {} : { task: target.task }),
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
