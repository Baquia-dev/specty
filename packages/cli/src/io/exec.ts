// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from "node:child_process";

export interface ExecOptions {
  readonly cwd: string;
  readonly input?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** Run `command` through the system shell (verification commands are shell strings). */
  readonly shell?: boolean;
  /** Hears each piece of stdout and stderr as it comes, for a live view of the output. */
  readonly onOutput?: (stream: "stdout" | "stderr", text: string) => void;
  /** Keep all of the output, as for git, whose output is data rather than a log. */
  readonly whole?: boolean;
}

export interface ExecResult {
  /** Exit code, or undefined when the process was killed (timeout or signal). */
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** What `execute` keeps of each stream, unless `whole`: an output this long lost its beginning. */
export const MAX_OUTPUT = 512 * 1024;

/** Runs a process and collects its output: the last 512 KB of each stream, or all with `whole`. */
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
    const keep = (text: string) =>
      options.whole === true || text.length <= MAX_OUTPUT ? text : text.slice(-MAX_OUTPUT);
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = keep(stdout + text);
      options.onOutput?.("stdout", text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = keep(stderr + text);
      options.onOutput?.("stderr", text);
    });
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            void endTree(child.pid);
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

/**
 * Ends a command and every process under it: a shell that runs `a && b` stays alive, and what it
 * started would keep the output open, and the command running, if only the shell were killed.
 * The tree is the one at that moment, asked to stop first and forced 2 s later.
 */
async function endTree(pid: number | undefined): Promise<void> {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("error", () => {});
    return;
  }
  const tree = [pid, ...descendants(pid, await childrenTable())];
  signal(tree, "SIGTERM");
  setTimeout(() => signal(tree, "SIGKILL"), 2000).unref();
}

function signal(pids: readonly number[], name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name);
    } catch {
      // It already ended.
    }
  }
}

function descendants(pid: number, children: ReadonlyMap<number, readonly number[]>): number[] {
  return (children.get(pid) ?? []).flatMap((child) => [child, ...descendants(child, children)]);
}

/** The children of each process, from `ps`; without it, none, and only the command itself ends. */
function childrenTable(): Promise<ReadonlyMap<number, readonly number[]>> {
  return new Promise((resolve) => {
    execFile("ps", ["-A", "-o", "pid=,ppid="], (error, stdout) => {
      const children = new Map<number, number[]>();
      const rows = error === null ? stdout.split("\n") : [];
      for (const [pid, parent] of rows.map((row) => row.trim().split(/\s+/).map(Number))) {
        if (pid === undefined || parent === undefined || Number.isNaN(pid)) continue;
        children.set(parent, [...(children.get(parent) ?? []), pid]);
      }
      resolve(children);
    });
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
