// SPDX-License-Identifier: Apache-2.0
import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import {
  headerOf,
  type Output,
  runRefusalCard,
  runStartedCard,
  type UnitsOutcome,
  unitsLines,
} from "@baquia-dev/specty-core";
import { pendingIntegration } from "../commands/integrate";
import { locateChanges } from "../flow/changes";
import { fullCommand, oneAtATime } from "../flow/full-verification";
import { contains, type Integration, integrationOf } from "../flow/integrate";
import { budgetedEnv } from "../flow/process-budget";
import { fullPlan, runUnits } from "../flow/units";
import { codeTree, recordFullVerification } from "../flow/verified";
import { lowerPriority } from "../io/exec";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { mergedVerification } from "./merged-run";
import { type Going, type LiveRun, liveRun } from "./run-output";
import { taskRuns } from "./watched-runs";

/**
 * A verification going on: its command, when it started and its output so far. One with a task is
 * that task's, run by `specty task done` in another process; one without is the full one.
 */
export interface Run {
  readonly task?: string;
  readonly command: string;
  readonly startedAt: string;
  /** Its last lines, oldest first. */
  readonly output: readonly string[];
  /**
   * The incorporation of «Verificar» stopped without moving anything: its output says why. The
   * server keeps it until the change's next run starts.
   */
  readonly stopped?: true;
}

export interface Runs {
  /** The verification of change `id` going on now, the full one first, if any. */
  current(id: string): Run | undefined;
  /** Starts the full verification of change `id` in its folder; the answer says whether it did. */
  start(id: string): Promise<Output>;
  /**
   * Ends the runs still going, without recording them: the server is closing. The verification
   * of an incorporation runs in `runLive`, which ends by its time limit.
   */
  close(): void;
}

/**
 * The full verifications the person starts from the UI, one per change: `verify.full`, or the
 * units of `verify.units` that have not passed, run with the shell in the change's folder, `heard` gets the run as it goes and `undefined` once it ends
 * and its turn is free, and the result goes to the change's audit as `change.verified`. When the
 * main branch moved on since the change's, it comes in first (`runMerged`), in `queued`: the
 * server's queue of the person's actions.
 */
export function changeRuns(
  session: Session,
  heard: (id: string, run: Run | undefined) => void,
  queued: (task: () => Promise<void>) => Promise<void> = (task) => task(),
): Runs {
  const going: Going = new Map();
  const stops = new Map<string, Run>();
  let closing = false;
  const tasks = taskRuns(session, (id, run) => {
    const mine = going.get(id);
    if (mine === undefined) heard(id, run);
    // An incorporation verifies in `runLive`: its run shows that one's lines after its own.
    else if (run !== undefined && run.task === undefined) mine.follow?.(run);
  });
  // The server queues its own full verifications, one after another, in order of arrival.
  let turns: Promise<void> = Promise.resolve();
  const inTurn = (run: () => Promise<void>) => {
    turns = turns.then(run).catch(() => undefined);
  };
  const target: RunTarget = {
    going,
    limits: session.config.internal.server,
    stops,
    heard,
    closing: () => closing,
    inTurn,
    queued,
    forget: (id) => tasks.forget(id),
  };
  return {
    current: (id) => going.get(id)?.run ?? tasks.current(id) ?? stops.get(id),
    start: (id) => started(session, target, id),
    close() {
      closing = true;
      tasks.close();
      for (const { stop } of going.values()) stop();
    },
  };
}

/**
 * Starts the full verification of change `id`, unless it cannot run: as it is or, when the main
 * branch moved on since the change's, with main merged in first (`runMerged`).
 */
async function started(session: Session, target: RunTarget, id: string): Promise<Output> {
  const { cards } = session;
  const found = (await locateChanges(session)).find(({ change }) => change.state.id === id);
  if (found === undefined) return runRefusalCard({ reason: "no-change", id }, headerOf(), cards);
  const { change, session: there } = found;
  const header = headerOf(id, change.state.phase);
  const command = fullCommand(there.config);
  if (change.state.phase !== "acceptance")
    return runRefusalCard({ reason: "not-in-acceptance" }, header, cards);
  if (command === undefined) return runRefusalCard({ reason: "no-full-verify" }, header, cards);
  if (target.going.has(id)) return runRefusalCard({ reason: "running" }, header, cards);
  const plan = await behind(there, change);
  // An agent that still resolves an earlier incorporation has its merge in that folder.
  const pending = plan && (await pendingIntegration(there, change, "accept"));
  if (pending?.kind === "wait") return pending.output;
  // Its tasks' runs are over: only the full one ends it, once its result is in the audit.
  target.forget(id);
  target.stops.delete(id);
  const job = { id, there, change, command };
  if (plan === undefined) {
    runFull(target, job);
    return runStartedCard(header, command, cards);
  }
  runMerged(target, job, plan);
  return runStartedCard(header, command, cards, plan.target);
}

/** Where a full verification reports: the runs going on, the listener, and whether the server closes. */
interface RunTarget {
  readonly going: Going;
  /** The lines a run keeps and how often it is heard: the server's `internal.server`. */
  readonly limits: { readonly runLines: number; readonly runEveryMs: number };
  /** The last run of each change whose incorporation stopped without moving anything. */
  readonly stops: Map<string, Run>;
  readonly heard: (id: string, run: Run | undefined) => void;
  readonly closing: () => boolean;
  /** Runs `run` after the server's full verifications before it. */
  readonly inTurn: (run: () => Promise<void>) => void;
  /** Runs `task` in the server's queue of the person's actions. */
  readonly queued: (task: () => Promise<void>) => Promise<void>;
  /** Forgets what the watcher of other processes' runs saw of a change. */
  readonly forget: (id: string) => void;
}

/** A full verification to run: change `id`'s, in its folder, with its command. */
interface FullRun {
  readonly id: string;
  readonly there: Session;
  readonly change: StoredChange;
  readonly command: string;
}

/**
 * Shows the run at once and runs it on the full verification's turn, after this server's earlier
 * ones: while another session holds the turn, the note of who it waits for goes to its output.
 * Its end is heard once the turn is free, so whoever hears it can take the turn at once.
 */
function runFull(target: RunTarget, job: FullRun): void {
  const { id, there, command } = job;
  // Until its command starts there is nothing to stop.
  let stop: () => void = () => undefined;
  const startedAt = there.environment.now().toISOString();
  const live = liveRun(target, id, { command, startedAt, output: [] }, () => stop());
  target.heard(id, live.current());
  const io = { ...there.environment.io, err: (text: string) => live.add(text.split("\n")) };
  const waiting = { ...there, environment: { ...there.environment, io } };
  target.inTurn(async () => {
    try {
      await oneAtATime(waiting, command, () =>
        verified(target, job, live, (kill) => {
          stop = kill;
        }),
      );
    } finally {
      // Not while the server closes, nor if the change has a run going on, which it would hide.
      if (!target.closing() && !target.going.has(id)) target.heard(id, undefined);
    }
  });
}

/** Where the change goes, when that branch moved on since the change's: it comes in first. */
async function behind(there: Session, change: StoredChange): Promise<Integration | undefined> {
  const plan = await integrationOf(there, change.state);
  return plan === undefined || (await contains(there.git, "HEAD", plan.target)) ? undefined : plan;
}

/**
 * Main moved on since the change's branch: shows the run at once and, on this server's turn and
 * in the queue of the person's actions, since it changes the change, merges main and verifies
 * the merged code (`mergedVerification`). Its notes go to its output, then the lines of the
 * verification that `runLive` keeps, and last what the incorporation said; its end is heard
 * once its result is recorded. If the incorporation stopped without moving anything, its end is
 * the run itself, `stopped`, kept until the change's next run. Nothing stops it: `runLive` ends
 * by `verify.timeoutSec`.
 */
function runMerged(target: RunTarget, job: FullRun, plan: Integration): void {
  const { id, there, command } = job;
  const startedAt = there.environment.now().toISOString();
  const first = { command, startedAt, output: [] };
  const live = liveRun(target, id, first, () => undefined, true);
  target.heard(id, live.current());
  const io = { ...there.environment.io, err: (text: string) => live.add(text.split("\n")) };
  const merging = { ...there, environment: { ...there.environment, io } };
  target.inTurn(() =>
    target.queued(async () => {
      let stopped = false;
      try {
        if (target.closing()) return;
        const said = await mergedVerification(merging, id, plan);
        live.add(said.lines);
        stopped = said.stopped;
      } finally {
        const pending = live.settle();
        target.going.delete(id);
        // The watcher saw the verification's file: its end is this run's, heard here.
        target.forget(id);
        if (!target.closing()) mergedEnd(target, id, live.current(), { stopped, pending });
      }
    }),
  );
}

/**
 * The end of an incorporation's run: the run itself, `stopped`, kept among the stops, when it
 * stopped without moving anything; otherwise its last lines, if due, and then nothing.
 */
function mergedEnd(
  target: RunTarget,
  id: string,
  last: Run,
  end: { readonly stopped: boolean; readonly pending: boolean },
): void {
  if (end.stopped) {
    const run: Run = { ...last, stopped: true };
    target.stops.set(id, run);
    target.heard(id, run);
    return;
  }
  // The last lines first, so whoever follows it sees them before it ends.
  if (end.pending) target.heard(id, last);
  target.heard(id, undefined);
}

/** What the full verification's command, or one of its units, did. */
interface Ran {
  /** Exit code; undefined when it was cut. */
  readonly code: number | undefined;
  /** The non-empty lines of the output of what ran last: the unit that failed, if one did. */
  readonly output: readonly string[];
  /** With `verify.units`, what each unit did. */
  readonly units?: UnitsOutcome;
}

/**
 * Runs the full verification, unless the server is closing, and settles once its result is
 * recorded: its command or, with `verify.units`, the units that have not passed, in order and
 * each in a process of its own; those that pass go into the clone's record.
 */
async function verified(
  target: RunTarget,
  job: FullRun,
  live: LiveRun,
  stoppable: (stop: () => void) => void,
): Promise<void> {
  if (target.closing()) return;
  const { id, there, command } = job;
  const started = Date.now();
  // The code it runs on, read as it starts: `accept` need not verify it again. Each reading of
  // the tree builds it in a temporary index of its own, so it goes alongside the fingerprints.
  const [tree, plan] = await Promise.all([codeTree(there), fullPlan(there, command)]);
  const run = (line: string) => spawned(target, there, line, live, stoppable);
  const ran: Ran =
    plan.units === undefined ? await run(command) : await runUnits(there, id, plan.units, run);
  await ended(target, job, live, { ...ran, started, tree });
}

/**
 * Runs `command` in the change's folder, live, unless the server is closing, with the environment
 * of every place (`budgetedEnv`), as the full verification holds them.
 */
async function spawned(
  target: RunTarget,
  there: Session,
  command: string,
  live: LiveRun,
  stoppable: (stop: () => void) => void,
): Promise<Ran> {
  const env = await budgetedEnv(there, Number.POSITIVE_INFINITY);
  if (target.closing()) return { code: undefined, output: [] };
  const child = spawn(command, {
    cwd: there.root,
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Below the rest of the machine, as every verification.
  if (child.pid !== undefined) lowerPriority(child.pid, there.config.internal.exec.priority);
  const stop = () => {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  };
  stoppable(stop);
  // Its own lines, which the audit keeps: the run's are also the other units' and the wait's.
  const output: string[] = [];
  const add = (lines: readonly string[]) => {
    output.push(...lines.filter((line) => line.length > 0));
    const kept = target.limits.runLines;
    if (output.length > kept) output.splice(0, output.length - kept);
    live.add(lines);
  };
  const rests = streamed(child, add);
  const limit = setTimeout(stop, there.config.verify.timeoutSec * 1000);
  return new Promise((done) => {
    let finished = false;
    const finish = (code: number | undefined) => {
      if (finished) return;
      finished = true;
      add([rests.stdout, rests.stderr].filter((line) => line.trim() !== ""));
      clearTimeout(limit);
      done({ code, output });
    };
    child.on("error", () => finish(127));
    child.on("close", (code) => finish(code ?? undefined));
  });
}

/** Sends the child's output to `add` line by line; what is left of each stream ends no line yet. */
function streamed(
  child: ChildProcessByStdio<null, Readable, Readable>,
  add: (lines: readonly string[]) => void,
) {
  const rests = { stdout: "", stderr: "" };
  for (const stream of ["stdout", "stderr"] as const) {
    child[stream].on("data", (chunk: Buffer) => {
      const lines = `${rests[stream]}${chunk.toString("utf8")}`.split("\n");
      rests[stream] = lines.pop() ?? "";
      add(lines.map((line) => line.trimEnd()));
    });
  }
  return rests;
}

/** The run ended: it leaves the runs going on and, unless the server is closing, goes to the audit. */
async function ended(
  target: RunTarget,
  job: FullRun,
  live: LiveRun,
  end: Ran & { readonly started: number; readonly tree: string | undefined },
): Promise<void> {
  const { id, there, change, command } = job;
  // What each unit did, as the run's last lines.
  if (end.units !== undefined) live.add(unitsLines(end.units, there.lang));
  const pending = live.settle();
  target.going.delete(id);
  if (target.closing()) return;
  // The last lines first, so whoever follows it sees them before it ends.
  if (pending) target.heard(id, live.current());
  await recordFullVerification(there, change, {
    command,
    started: end.started,
    code: end.code,
    ms: Date.now() - end.started,
    output: end.output,
    ...(end.tree === undefined ? {} : { tree: end.tree }),
    ...(end.units === undefined ? {} : { units: end.units }),
  }).catch(() => undefined);
}
