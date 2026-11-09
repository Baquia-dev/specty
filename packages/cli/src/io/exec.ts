// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from "node:child_process";
import { getPriority, setPriority } from "node:os";
import { DEFAULT_CONFIG, type ResolvedConfig } from "@baquia-dev/specty-core";
import { findProgram, type System, startOf } from "./programs";

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
  /** What it keeps of each stream unless `whole`, in characters: `MAX_OUTPUT` by default. */
  readonly maxOutput?: number;
  /**
   * Run it below the rest of the machine, at `priority`, as verifications do, and every process
   * it starts with it (`launch`). Best effort: where the system refuses, it runs as it is.
   */
  readonly lowPriority?: boolean;
  /** The priority `lowPriority` runs it at: `internal.exec.priority`, 10 by default. */
  readonly priority?: number;
}

export interface ExecResult {
  /** Exit code, or undefined when the process was killed (timeout or signal). */
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** What `execute` keeps of each stream, unless `whole`: an output this long lost its beginning. */
export const MAX_OUTPUT = maxOutputOf(DEFAULT_CONFIG);

/**
 * The most Specty reads of a command whose whole text it uses, in characters, and the most the
 * UI serves of a diff, a trace or a test's code: `internal.exec.maxOutputKiB` (formats.md §6).
 */
export function maxOutputOf(config: Pick<ResolvedConfig, "internal">): number {
  return config.internal.exec.maxOutputKiB * 1024;
}

/** How `launch` starts a command: the program, its arguments and whether through the shell. */
export interface Launch {
  readonly file: string;
  readonly args: readonly string[];
  readonly shell: boolean;
  /** Its arguments go to `spawn` as they are (`windowsVerbatimArguments`): cmd.exe's own line. */
  readonly verbatim: boolean;
  /** What to do with its process once started: lower it, where it could not be born lower. */
  readonly started: (pid: number | undefined) => void;
}

/** The shell Node runs a command through on every system but Windows. */
const SHELL = "/bin/sh";

/**
 * How to start `command` with `args`, through the shell with `shell`, at `priority`: as it is
 * without one. With `nice` in the folders of `env`'s PATH, outside Windows, through it: it is born
 * at its priority, and so is every process it starts, even one it starts at once, which a shell
 * of Linux starts in a process of its own. Without it, as on Windows, it is lowered once started,
 * and a process it started before keeps its own. Already at that priority or lower, it runs at
 * Specty's, since a process without privileges cannot raise its own. Without the shell, on
 * Windows, it starts what `startOf` finds: the program by PATHEXT, and a `.cmd` through cmd.exe.
 */
export function launch(
  command: string,
  args: readonly string[],
  shell: boolean,
  env: NodeJS.ProcessEnv,
  priority?: number,
  system?: System,
): Launch {
  const start = shell
    ? { file: command, args, verbatim: false }
    : startOf(command, args, env, system);
  const plain: Launch = { ...start, shell, started: () => undefined };
  const by = priority === undefined ? 0 : priority - getPriority();
  if (priority === undefined || by <= 0) return plain;
  const windows = (system?.platform ?? process.platform) === "win32";
  const nice = windows ? undefined : findProgram("nice", env, system);
  if (nice === undefined) {
    return { ...plain, started: (pid) => lowerPriority(pid, priority) };
  }
  const line = shell ? [SHELL, "-c", [command, ...args].join(" ")] : [command, ...args];
  return {
    file: nice,
    args: ["-n", String(by), ...line],
    shell: false,
    verbatim: false,
    started: () => undefined,
  };
}

/**
 * Lowers the priority of process `pid` to `priority`, once started. A system that refuses leaves
 * it as it is.
 */
function lowerPriority(pid: number | undefined, priority: number): void {
  if (pid === undefined) return;
  try {
    setPriority(pid, priority);
  } catch {
    // Best effort: the command runs all the same.
  }
}

/** How `execute` starts `command`: at `priority` with `lowPriority`, and as it is without. */
function launchOf(command: string, args: readonly string[], options: ExecOptions): Launch {
  const priority =
    options.lowPriority === true
      ? (options.priority ?? DEFAULT_CONFIG.internal.exec.priority)
      : undefined;
  return launch(command, args, options.shell ?? false, options.env ?? process.env, priority);
}

/**
 * Runs a process and collects its output: the last `maxOutput` characters of each stream (512 KiB
 * by default), or all with `whole`.
 */
export function execute(
  command: string,
  args: readonly string[],
  options: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const how = launchOf(command, args, options);
    const child = spawn(how.file, [...how.args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: how.shell,
      windowsVerbatimArguments: how.verbatim,
      stdio: ["pipe", "pipe", "pipe"],
    });
    how.started(child.pid);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const most = options.maxOutput ?? MAX_OUTPUT;
    const keep = (text: string) =>
      options.whole === true || text.length <= most ? text : text.slice(-most);
    // Decoded as a stream, a character whose bytes come in two pieces arrives whole.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      stdout = keep(stdout + text);
      options.onOutput?.("stdout", text);
    });
    child.stderr.on("data", (text: string) => {
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
async function childrenTable(): Promise<ReadonlyMap<number, readonly number[]>> {
  const children = new Map<number, number[]>();
  for (const [pid, parent] of await processTable()) {
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  return children;
}

/**
 * The processes that started this one, from its parent up, from `ps`; without it, as on Windows,
 * only its parent.
 */
export async function ancestors(): Promise<ReadonlySet<number>> {
  const parents = new Map(await processTable());
  const found = new Set<number>();
  for (let pid = process.ppid; pid > 1 && !found.has(pid); pid = parents.get(pid) ?? 0) {
    found.add(pid);
  }
  return found;
}

/** Each process and its parent, from `ps`; none without it. */
function processTable(): Promise<readonly (readonly [number, number])[]> {
  return new Promise((resolve) => {
    execFile("ps", ["-A", "-o", "pid=,ppid="], (error, stdout) => {
      const rows = error === null ? stdout.split("\n") : [];
      resolve(
        rows.flatMap((row) => {
          const [pid, parent] = row.trim().split(/\s+/).map(Number);
          return pid === undefined ||
            parent === undefined ||
            Number.isNaN(pid) ||
            Number.isNaN(parent)
            ? []
            : [[pid, parent] as const];
        }),
      );
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
