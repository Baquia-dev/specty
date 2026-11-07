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

/**
 * A conversation kept open, as a person's session stays while work goes on in the background:
 * the message its input starts with, and whether nothing is left to do after a line of its output.
 */
export interface Session {
  readonly input: string;
  done(line: string): boolean;
}

/**
 * `command` with `args`, stopped with a signal once `timeoutMs` go by. Its input is closed; with
 * `session`, it starts with the session's message and stays open until the first whole line of
 * its output that the session calls done.
 */
export function launch(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly timeoutMs: number;
    readonly session?: Session | undefined;
  },
): Launched {
  const { session } = options;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    stdio: [session === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  let done = false;
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => stdout.push(chunk));
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => stderr.push(chunk));
  if (session !== undefined && child.stdin !== null) {
    const input = child.stdin;
    // An agent that already left can't read it: its end is what counts.
    input.on("error", () => {});
    input.write(session.input);
    const read = lines(
      (line) => session.done(line),
      () => input.end(),
    );
    child.stdout?.on("data", read);
  }
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

/**
 * A reader of chunks that asks `isDone` about each whole line, until one is, and then calls
 * `close` once.
 */
function lines(isDone: (line: string) => boolean, close: () => void): (chunk: string) => void {
  let partial = "";
  let closed = false;
  return (chunk) => {
    if (closed) return;
    const parts = `${partial}${chunk}`.split("\n");
    partial = parts.pop() ?? "";
    for (const line of parts) {
      if (!isDone(line)) continue;
      closed = true;
      close();
      return;
    }
  };
}
