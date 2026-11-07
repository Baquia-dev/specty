// SPDX-License-Identifier: Apache-2.0
import { type ExecResult, execute } from "../io/exec";
import type { Session } from "../session";
import { clearRun, writeRun } from "../store/runs";
import { inSlots } from "../store/verify-slots";
import { oneAtATime } from "./full-verification";
import { budgetedEnv } from "./process-budget";

/** How a live run starts. */
interface LiveOptions {
  /** Hears the moment the command starts: a full one first waits for its turn. */
  readonly onStart?: () => void;
  /** A unit of a full verification that holds the turn and the places already: it takes none. */
  readonly held?: boolean;
}

/**
 * Runs the verification of `task` of change `change`, or with no task the full one, and keeps it
 * live for the local server and the MCP App (`store/runs.ts`): the file keeps the last
 * `internal.server.runLines` lines, since their end is what matters, is written as lines come, at
 * most every `internal.server.runEveryMs`, and is removed once the command ends, whether it passed
 * or not. The command starts with the environment of its places (`budgetedEnv`): a task's holds
 * one, the full one and each of its units all.
 */
export async function runLive(
  session: Session,
  change: string,
  task: string | undefined,
  command: string,
  { onStart, held = false }: LiveOptions = {},
): Promise<ExecResult> {
  const { runLines, runEveryMs } = session.config.internal.server;
  const startedAt = session.environment.now().toISOString();
  let output: string[] = [];
  const rests = { stdout: "", stderr: "" };
  let pending: NodeJS.Timeout | undefined;
  let writing: Promise<void> = Promise.resolve();
  const of = task === undefined ? {} : { task };
  const write = () => {
    pending = undefined;
    const run = { ...of, command, startedAt, output, pid: process.pid };
    writing = writing.then(() => writeRun(session.git, change, run)).catch(() => undefined);
  };
  write();
  const go = async () => {
    onStart?.();
    const env = await budgetedEnv(session, task === undefined ? Number.POSITIVE_INFINITY : 1);
    return execute(command, [], {
      cwd: session.root,
      shell: true,
      env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
      lowPriority: true,
      priority: session.config.internal.exec.priority,
      onOutput: (stream, text) => {
        const lines = `${rests[stream]}${text}`.split("\n");
        rests[stream] = lines.pop() ?? "";
        output = [...output, ...lines.map((line) => line.trimEnd())].slice(-runLines);
        pending ??= setTimeout(write, runEveryMs);
      },
    });
  };
  try {
    return await placed(session, task, command, held, go);
  } finally {
    clearTimeout(pending);
    await writing;
    await clearRun(session.git, change).catch(() => undefined);
  }
}

/**
 * Runs `go` in its places: a full verification, with no task, waits for its turn and every place
 * of the clone; a task's, for one place; a unit of a full verification that holds them, for none.
 */
function placed(
  session: Session,
  task: string | undefined,
  command: string,
  held: boolean,
  go: () => Promise<ExecResult>,
): Promise<ExecResult> {
  if (held) return go();
  return task === undefined ? oneAtATime(session, command, go) : inSlots(session, 1, command, go);
}
