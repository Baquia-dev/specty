// SPDX-License-Identifier: Apache-2.0
import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { headerOf, type Output, runRefusalCard, runStartedCard } from "@baquia-dev/specty-core";
import { locateChanges } from "../flow/changes";
import { oneAtATime } from "../flow/full-verification";
import { codeTree, recordFullVerification } from "../flow/verified";
import { lowerPriority } from "../io/exec";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { clearRun, readRuns } from "../store/runs";

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
}

export interface Runs {
  /** The verification of change `id` going on now, the full one first, if any. */
  current(id: string): Run | undefined;
  /** Starts the full verification of change `id` in its folder; the answer says whether it did. */
  start(id: string): Promise<Output>;
  /** Ends the runs still going, without recording them: the server is closing. */
  close(): void;
}

/** What a run keeps of its output: its end is what matters. */
const KEPT = 1000;
/** At most this often, in milliseconds, the listener hears a run that moves. */
const EVERY = 250;
/** How often, in milliseconds, the server looks at the tasks' verifications in other processes. */
const TASKS_EVERY = 500;

/**
 * The full verifications the person starts from the UI, one per change: `verify.full` runs with
 * the shell in the change's folder, `heard` gets the run as it goes and `undefined` once it ends
 * and its turn is free, and the result goes to the change's audit as `change.verified`.
 */
export function changeRuns(
  session: Session,
  heard: (id: string, run: Run | undefined) => void,
): Runs {
  const going: Going = new Map();
  let closing = false;
  const tasks = taskRuns(session, (id, run) => {
    if (!going.has(id)) heard(id, run);
  });
  // The turn is this process's: the server queues its own full verifications, one after another.
  let turns: Promise<void> = Promise.resolve();
  const inTurn = (run: () => Promise<void>) => {
    turns = turns.then(run).catch(() => undefined);
  };
  const target: RunTarget = { going, heard, closing: () => closing, inTurn };
  return {
    current: (id) => going.get(id)?.run ?? tasks.current(id),
    async start(id) {
      const { cards } = session;
      const found = (await locateChanges(session)).find(({ change }) => change.state.id === id);
      if (found === undefined)
        return runRefusalCard({ reason: "no-change", id }, headerOf(), cards);
      const { change, session: there } = found;
      const header = headerOf(id, change.state.phase);
      const command = there.config.verify.full;
      if (change.state.phase !== "acceptance")
        return runRefusalCard({ reason: "not-in-acceptance" }, header, cards);
      if (command === undefined) return runRefusalCard({ reason: "no-full-verify" }, header, cards);
      if (going.has(id)) return runRefusalCard({ reason: "running" }, header, cards);
      // Its tasks' runs are over: only the full one ends it, once its result is in the audit.
      tasks.forget(id);
      runFull(target, { id, there, change, command });
      return runStartedCard(header, command, cards);
    },
    close() {
      closing = true;
      tasks.close();
      for (const { stop } of going.values()) stop();
    },
  };
}

/** The full verifications going on, by change, each with how to stop it. */
type Going = Map<string, { run: Run; stop: () => void }>;

/** Where a full verification reports: the runs going on, the listener, and whether the server closes. */
interface RunTarget {
  readonly going: Going;
  readonly heard: (id: string, run: Run | undefined) => void;
  readonly closing: () => boolean;
  /** Runs `run` after the server's full verifications before it. */
  readonly inTurn: (run: () => Promise<void>) => void;
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
        spawned(target, job, live, (kill) => {
          stop = kill;
        }),
      );
    } finally {
      // Not while the server closes, nor if the change has a run going on, which it would hide.
      if (!target.closing() && !target.going.has(id)) target.heard(id, undefined);
    }
  });
}

/** Runs the command, unless the server is closing, and settles once its result is recorded. */
function spawned(
  target: RunTarget,
  job: FullRun,
  live: LiveRun,
  stoppable: (stop: () => void) => void,
): Promise<void> {
  if (target.closing()) return Promise.resolve();
  const { there, command } = job;
  // The code it runs on, read as it starts: `accept` need not verify it again.
  const tree = codeTree(there);
  const started = Date.now();
  const child = spawn(command, {
    cwd: there.root,
    env: there.environment.env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Below the rest of the machine, as every verification.
  if (child.pid !== undefined) lowerPriority(child.pid);
  const stop = () => {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  };
  stoppable(stop);
  const rests = streamed(child, live);
  const limit = setTimeout(stop, there.config.verify.timeoutSec * 1000);
  return new Promise((done) => {
    let finished = false;
    const finish = async (code: number | undefined) => {
      if (finished) return;
      finished = true;
      live.add([rests.stdout, rests.stderr].filter((line) => line.trim() !== ""));
      clearTimeout(limit);
      await ended(target, job, live, { code, started, tree });
      done();
    };
    child.on("error", () => void finish(127));
    child.on("close", (code) => void finish(code ?? undefined));
  });
}

/** Sends the child's output to the run line by line; what is left of each stream ends no line yet. */
function streamed(child: ChildProcessByStdio<null, Readable, Readable>, live: LiveRun) {
  const rests = { stdout: "", stderr: "" };
  for (const stream of ["stdout", "stderr"] as const) {
    child[stream].on("data", (chunk: Buffer) => {
      const lines = `${rests[stream]}${chunk.toString("utf8")}`.split("\n");
      rests[stream] = lines.pop() ?? "";
      live.add(lines.map((line) => line.trimEnd()));
    });
  }
  return rests;
}

/** A run's output as it comes: kept among the runs going on, and heard at most every `EVERY` ms. */
interface LiveRun {
  add(lines: readonly string[]): void;
  /** The run as it is now. */
  current(): Run;
  /** Cancels the notice that was due; whether there was one. */
  settle(): boolean;
}

function liveRun(target: RunTarget, id: string, first: Run, stop: () => void): LiveRun {
  let current = first;
  target.going.set(id, { run: current, stop });
  let tell: NodeJS.Timeout | undefined;
  return {
    add(lines) {
      if (lines.length === 0) return;
      current = { ...current, output: [...current.output, ...lines].slice(-KEPT) };
      target.going.set(id, { run: current, stop });
      tell ??= setTimeout(() => {
        tell = undefined;
        target.heard(id, current);
      }, EVERY);
    },
    current: () => current,
    settle() {
      const pending = tell !== undefined;
      clearTimeout(tell);
      return pending;
    },
  };
}

/** The run ended: it leaves the runs going on and, unless the server is closing, goes to the audit. */
async function ended(
  target: RunTarget,
  job: FullRun,
  live: LiveRun,
  end: {
    readonly code: number | undefined;
    readonly started: number;
    readonly tree: ReturnType<typeof codeTree>;
  },
): Promise<void> {
  const { id, there, change, command } = job;
  const pending = live.settle();
  target.going.delete(id);
  if (target.closing()) return;
  // The last lines first, so whoever follows it sees them before it ends.
  if (pending) target.heard(id, live.current());
  const output = live.current().output.filter((line) => line.length > 0);
  const ran = await end.tree;
  await recordFullVerification(there, change, {
    command,
    started: end.started,
    code: end.code,
    ms: Date.now() - end.started,
    output,
    ...(ran === undefined ? {} : { tree: ran }),
  }).catch(() => undefined);
}

/**
 * The tasks' verifications that `specty task done` keeps live in other processes, and the full
 * one of `specty accept` (`store/runs.ts`), looked at every half second: `heard` gets each one that moves, and
 * `undefined` once its file is gone. A file whose process no longer exists is removed unseen.
 * `forget` drops what it saw of a change, so that it does not end that change's run again.
 */
function taskRuns(
  session: Session,
  heard: (id: string, run: Run | undefined) => void,
): { current(id: string): Run | undefined; forget(id: string): void; close(): void } {
  let runs = new Map<string, Run>();
  const said = new Map<string, string>();
  const look = async () => {
    const now = new Map<string, Run>();
    for (const [id, live] of await readRuns(session.git)) {
      if (!alive(live.pid)) {
        await clearRun(session.git, id);
        continue;
      }
      // Without a task it is the full one, which `specty accept` runs.
      const { pid: _pid, ...run } = live;
      now.set(id, run);
    }
    runs = now;
    for (const [id, run] of now) {
      const text = JSON.stringify(run);
      if (said.get(id) !== text) heard(id, run);
      said.set(id, text);
    }
    for (const id of [...said.keys()].filter((known) => !now.has(known))) {
      said.delete(id);
      heard(id, undefined);
    }
  };
  let looking = false;
  const timer = setInterval(() => {
    if (looking) return;
    looking = true;
    look()
      .catch(() => undefined)
      .finally(() => {
        looking = false;
      });
  }, TASKS_EVERY);
  timer.unref();
  return {
    current: (id) => runs.get(id),
    forget: (id) => said.delete(id),
    close: () => clearInterval(timer),
  };
}

/** Whether process `pid` still exists: one that only refuses signals from us does. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}
