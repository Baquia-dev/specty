// SPDX-License-Identifier: Apache-2.0
// How to start `specty` on this machine, and how to stop it. On Windows npm installs it as a
// `specty.cmd`, which Node starts only through cmd.exe, and a process ends without a signal: the
// extension finds the file itself, and ends the whole tree with `taskkill`.
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { win32 } from "node:path";

/** The machine: its system, its environment and whether a path is a file. */
export interface Host {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly isFile: (path: string) => boolean;
}

/** A program to start with its arguments; `verbatim` when they reach it without more quoting. */
interface Launch {
  readonly file: string;
  readonly args: readonly string[];
  readonly verbatim: boolean;
}

/** A started process, as `spawn` gives it. */
interface Started {
  readonly pid?: number | undefined;
  kill(signal?: NodeJS.Signals | number): boolean;
}

/** Starts a program and leaves it running, as stopping does with `taskkill`. */
type Run = (
  file: string,
  args: readonly string[],
) => { once(event: "error", listener: () => void): unknown };

const HOST: Host = { platform: process.platform, env: process.env, isFile };

/** The extensions Windows runs when `PATHEXT` does not say. */
const PATHEXT = ".COM;.EXE;.BAT;.CMD";
const BATCH = /\.(?:cmd|bat)$/i;
const SCRIPT = /\.[cm]?js$/i;

/**
 * How to start `command` with `args`, or nothing when Windows has no such file. Outside Windows, the
 * command as it is: a missing one is the error of starting it.
 */
export function launchOf(
  command: string,
  args: readonly string[],
  host: Host = HOST,
): Launch | undefined {
  if (host.platform !== "win32") return { file: command, args, verbatim: false };
  const found = located(command, host);
  if (found === undefined) return undefined;
  if (!SCRIPT.test(found)) return program(found, args, host);
  // A script of Node's, like the CLI's `specty.mjs`: Windows does not run it by its first line.
  const node = located("node", host);
  return node === undefined ? undefined : program(node, [found, ...args], host);
}

/**
 * The file Windows would run for `command`: a path as it is and a name in the absolute folders of
 * the `PATH`, never in the current one, the repository's; without an extension, with each one of
 * `PATHEXT`, in order.
 */
function located(command: string, host: Host): string | undefined {
  const folders = /[\\/:]/.test(command) ? [undefined] : searched(host.env);
  const extensions = (variable(host.env, "PATHEXT") ?? PATHEXT).split(";").filter(Boolean);
  const names = extensions.map((extension) => `${command}${extension}`);
  if (win32.extname(command) !== "") names.unshift(command);
  return folders
    .flatMap((folder) =>
      names.map((name) => (folder === undefined ? name : win32.join(folder, name))),
    )
    .find((path) => host.isFile(path));
}

/** The absolute folders of the `PATH`, without the quotes Windows allows around them. */
function searched(env: NodeJS.ProcessEnv): string[] {
  return (variable(env, "PATH") ?? "")
    .split(";")
    .map((folder) => folder.replaceAll('"', "").trim())
    .filter((folder) => win32.isAbsolute(folder));
}

/**
 * A program Windows starts as it is, or a `.cmd` or `.bat` through cmd.exe: `/s` takes away only
 * the outer quotes, and leaves the line with each path quoted. Between quotes cmd.exe still expands
 * `%NAME%`, so a path with a variable's name between `%` would break.
 */
function program(file: string, args: readonly string[], host: Host): Launch {
  if (!BATCH.test(file)) return { file, args, verbatim: false };
  const line = [`"${file}"`, ...args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))].join(" ");
  const shell = variable(host.env, "ComSpec") ?? system(host, "cmd.exe");
  return { file: shell, args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
}

/**
 * Stops `child` and what it started. On Windows no signal reaches it, and ending it alone would
 * leave the server that its cmd.exe started: `taskkill` ends the whole tree, and the process alone
 * if `taskkill` does not start. Elsewhere, SIGTERM.
 */
export function stopTree(child: Started, host: Host = HOST, run: Run = quietly): void {
  if (host.platform !== "win32" || child.pid === undefined) {
    child.kill("SIGTERM");
    return;
  }
  const taskkill = system(host, "taskkill.exe");
  run(taskkill, ["/pid", String(child.pid), "/T", "/F"]).once("error", () => child.kill());
}

function quietly(file: string, args: readonly string[]) {
  return spawn(file, args, { stdio: "ignore", windowsHide: true });
}

/** A program of Windows itself, from its folder and not from the `PATH`. */
function system(host: Host, name: string): string {
  return win32.join(variable(host.env, "SystemRoot") ?? "C:\\Windows", "System32", name);
}

/** A variable of the environment, whatever its capitals, as Windows reads them. */
function variable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((each) => each.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
