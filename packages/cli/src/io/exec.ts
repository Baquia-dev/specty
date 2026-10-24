// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";

export interface ExecOptions {
  readonly cwd: string;
  readonly input?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** Run `command` through the system shell (verification commands are shell strings). */
  readonly shell?: boolean;
}

export interface ExecResult {
  /** Exit code, or undefined when the process was killed (timeout or signal). */
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** What `execute` keeps of each stream: an output this long lost its beginning. */
export const MAX_OUTPUT = 512 * 1024;

/** Runs a process and collects its output (the last 512 KB of each stream). */
export function execute(
  command: string,
  args: readonly string[],
  options: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const keep = (text: string) => (text.length > MAX_OUTPUT ? text.slice(-MAX_OUTPUT) : text);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = keep(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = keep(stderr + chunk.toString("utf8"));
    });
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 2000).unref();
          }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut || code === null ? undefined : code, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.input ?? "");
  });
}

/** The last `count` non-empty lines of a command's combined output. */
export function tail(result: ExecResult, count = 30): string[] {
  return `${result.stdout}\n${result.stderr}`
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-count);
}
