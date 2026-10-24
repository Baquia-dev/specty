// SPDX-License-Identifier: Apache-2.0
import { type ExecResult, execute } from "../io/exec";
import type { Session } from "../session";
import { clearRun, writeRun } from "../store/runs";

/** Lines a live run keeps: its end is what matters. */
const KEPT = 1000;
/** At most this often, in milliseconds, the live file is written again. */
const EVERY = 250;

/**
 * Runs the verification of `task` of change `change` and keeps it live for the local server
 * (`store/runs.ts`): the file is written as lines come, at most every 250 ms, and removed once
 * the command ends, whether it passed or not.
 */
export async function runLive(
  session: Session,
  change: string,
  task: string,
  command: string,
): Promise<ExecResult> {
  const startedAt = session.environment.now().toISOString();
  let output: string[] = [];
  const rests = { stdout: "", stderr: "" };
  let pending: NodeJS.Timeout | undefined;
  let writing: Promise<void> = Promise.resolve();
  const write = () => {
    pending = undefined;
    const run = { task, command, startedAt, output, pid: process.pid };
    writing = writing.then(() => writeRun(session.git, change, run)).catch(() => undefined);
  };
  write();
  try {
    return await execute(command, [], {
      cwd: session.root,
      shell: true,
      env: session.environment.env,
      timeoutMs: session.config.verify.timeoutSec * 1000,
      onOutput: (stream, text) => {
        const lines = `${rests[stream]}${text}`.split("\n");
        rests[stream] = lines.pop() ?? "";
        output = [...output, ...lines.map((line) => line.trimEnd())].slice(-KEPT);
        pending ??= setTimeout(write, EVERY);
      },
    });
  } finally {
    clearTimeout(pending);
    await writing;
    await clearRun(session.git, change).catch(() => undefined);
  }
}
