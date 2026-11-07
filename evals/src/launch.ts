// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";

/**
 * An agent's run without blocking (ARCHITECTURE §16): the suite goes on while it runs, so a
 * person can decide meanwhile, and gathers its output when it ends or its limit stops it.
 */

interface Finished {
  /** Its exit code; none when a signal ended it, as its limit does. */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Launched {
  /** Whether it is still running. */
  running(): boolean;
  readonly finished: Promise<Finished>;
}

/** `command` with `args`, its input closed, stopped with a signal once `timeoutMs` go by. */
export function launch(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeoutMs: number },
): Launched {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let done = false;
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => stdout.push(chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => stderr.push(chunk));
  const finished = new Promise<Finished>((resolve) => {
    const end = (status: number | null) => {
      done = true;
      resolve({ status, stdout: stdout.join(""), stderr: stderr.join("") });
    };
    child.on("close", end);
    child.on("error", (error) => {
      stderr.push(String(error));
      end(null);
    });
  });
  return { running: () => !done, finished };
}
