// SPDX-License-Identifier: Apache-2.0
import { accessSync, constants, statSync } from "node:fs";
import { posix, win32 } from "node:path";

/** How a system finds the programs it runs. */
export interface System {
  readonly platform: NodeJS.Platform;
  /** Whether `path` is a program it can run: on Windows a file, which its extension makes one. */
  readonly runnable: (path: string) => boolean;
}

/** This machine. */
const SYSTEM: System = { platform: process.platform, runnable: runnableHere };

function runnableHere(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The extensions of PATHEXT that Specty starts: programs by themselves, batch files by cmd.exe. */
const STARTED = [".com", ".exe", ".bat", ".cmd"];
const BATCH = new Set([".bat", ".cmd"]);

/**
 * The value of `name` in `env`. On Windows its case does not matter, and with several keys of the
 * same name it is the first in sort order, the one Node's `spawn` keeps.
 */
function variable(env: NodeJS.ProcessEnv, name: string, system: System): string | undefined {
  if (system.platform !== "win32") return env[name];
  const key = Object.keys(env)
    .toSorted()
    .find((candidate) => candidate.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

/**
 * Where `name` is as a program: a path as it is, and a name alone in the absolute folders of the
 * PATH, in order, never in the current folder. On Windows, with the extensions of PATHEXT that
 * Specty starts (`.COM;.EXE;.BAT;.CMD` without it), in its order, unless it already has one, as
 * cmd.exe finds programs; elsewhere, an executable file, as `command -v` does. None without it.
 */
export function findProgram(
  name: string,
  env: NodeJS.ProcessEnv,
  system: System = SYSTEM,
): string | undefined {
  const windows = system.platform === "win32";
  const path = windows ? win32 : posix;
  const names = windows ? withExtensions(name, env, system) : [name];
  const alone = !(windows ? /[\\/]/ : /\//).test(name);
  if (!alone)
    return names.find((candidate) => path.isAbsolute(candidate) && system.runnable(candidate));
  const folders = (variable(env, "PATH", system) ?? "")
    .split(path.delimiter)
    .map((folder) => (windows ? folder.replace(/^"(.*)"$/, "$1") : folder))
    .filter((folder) => folder.length > 0 && path.isAbsolute(folder));
  for (const folder of folders) {
    const found = names.map((candidate) => path.join(folder, candidate)).find(system.runnable);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `name` with each extension of PATHEXT that Specty starts, or alone when it has one already. */
function withExtensions(name: string, env: NodeJS.ProcessEnv, system: System): string[] {
  const extensions = (variable(env, "PATHEXT", system) ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => STARTED.includes(extension));
  const own = win32.extname(name).toLowerCase();
  return extensions.includes(own) ? [name] : extensions.map((extension) => `${name}${extension}`);
}

/** How to start a program without the shell: the file, its arguments and whether they go verbatim. */
export interface Start {
  readonly file: string;
  readonly args: readonly string[];
  /** Node must pass `args` as they are (`windowsVerbatimArguments`): they are cmd.exe's line. */
  readonly verbatim: boolean;
}

/**
 * How to start `command` with `args` without the shell. Outside Windows, as it is. On Windows,
 * the program `findProgram` finds, since Node only finds `.exe` and `.com` and looks in the
 * current folder first; a batch file (`.cmd`, `.bat`, as npm's and pnpm's shims) through cmd.exe,
 * the only one that runs it, with its line escaped (`batchLine`). What it does not find, as it is,
 * so that it fails as before.
 */
export function startOf(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  system: System = SYSTEM,
): Start {
  const found = system.platform === "win32" ? findProgram(command, env, system) : undefined;
  if (found === undefined) return { file: command, args, verbatim: false };
  if (!BATCH.has(win32.extname(found).toLowerCase())) return { file: found, args, verbatim: false };
  return {
    file: variable(env, "ComSpec", system) ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${batchLine(found, args)}"`],
    verbatim: true,
  };
}

/** cmd.exe's metacharacters, each read literally after a `^`. */
const META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * The line cmd.exe runs for the batch file `file` with `args`, as cross-spawn writes it (CWE-78):
 * the path with a `^` before each metacharacter, and each argument quoted as Microsoft's C runtime
 * reads it and then escaped twice, once for cmd.exe and once more for the `%*` with which the
 * batch file hands its arguments on, which reads them again. No argument runs as a command, and
 * each reaches the program as it was.
 */
function batchLine(file: string, args: readonly string[]): string {
  const caret = (text: string) => text.replace(META, "^$1");
  return [caret(file), ...args.map((arg) => caret(caret(quoted(arg))))].join(" ");
}

/**
 * `arg` in quotes, as Microsoft's C runtime reads it back: the backslashes before a quote and
 * those at the end doubled, and each quote after a backslash.
 */
function quoted(arg: string): string {
  let text = "";
  let slashes = 0;
  for (const char of arg) {
    if (char === "\\") {
      slashes++;
      continue;
    }
    text += char === '"' ? `${"\\".repeat(slashes * 2 + 1)}"` : `${"\\".repeat(slashes)}${char}`;
    slashes = 0;
  }
  return `"${text}${"\\".repeat(slashes * 2)}"`;
}
