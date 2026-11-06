// SPDX-License-Identifier: Apache-2.0
import { basename } from "../paths";

/**
 * The commands whose only purpose is waiting, which the guard stops while the change waits for
 * the person. Only the evident ones, so that a command that also does work never counts:
 * `caffeinate` running a program that works, `tail` following a file, or the shell's `wait`
 * collecting the jobs its own command launched.
 */

/** Programs that only wait, whatever their arguments: `pwait` and `pidwait` wait for processes. */
const ALWAYS: ReadonlySet<string> = new Set(["sleep", "pwait", "pidwait"]);

/** `caffeinate`'s options that take a value: `-t <seconds>` and `-w <pid>`. */
const CAFFEINATE_VALUES: ReadonlySet<string> = new Set(["t", "w"]);

/**
 * The program that only waits in a simple command running `program` with `args`, or undefined.
 * `launched` says whether the command sent jobs to the background before it: the shell's `wait`
 * collects them, and they are judged by themselves.
 */
export function waitingProgram(
  program: string,
  args: readonly string[],
  launched: boolean,
): string | undefined {
  if (ALWAYS.has(program)) return program;
  if (program === "wait") return launched ? undefined : program;
  if (program === "caffeinate") return caffeinated(args, launched);
  if (program === "tail" && followsNothing(args)) return program;
  return undefined;
}

/**
 * `caffeinate` with no program waits: for a process (`-w`), a time (`-t`) or until stopped. With
 * a program, it waits only as that program does.
 */
function caffeinated(args: readonly string[], launched: boolean): string | undefined {
  const start = utilityStart(args);
  if (start === undefined) return "caffeinate";
  const [utility = "", ...rest] = args.slice(start);
  return waitingProgram(basename(utility), rest, launched);
}

/** Where the program `caffeinate` runs starts in `args`, read as getopt does, if there is one. */
function utilityStart(args: readonly string[]): number | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === "--") return index + 1 < args.length ? index + 1 : undefined;
    if (!arg.startsWith("-")) return index;
    // `-t 60` and `-it 60` take the next word as the value; `-t60` holds it.
    const flags = arg.slice(1);
    const valued = [...flags].findIndex((flag) => CAFFEINATE_VALUES.has(flag));
    if (valued === flags.length - 1) index++;
  }
  return undefined;
}

/** `tail` following only `/dev/null`, which shows nothing: `tail -f /dev/null`, `tail --pid=<pid> -f /dev/null`. */
function followsNothing(args: readonly string[]): boolean {
  const follows = args.some(
    (arg) =>
      arg === "--follow" || arg.startsWith("--follow=") || /^-[a-zA-Z]*[fF][a-zA-Z]*$/.test(arg),
  );
  const operands = args.filter((arg) => !arg.startsWith("-"));
  return follows && operands.length > 0 && operands.every((arg) => arg === "/dev/null");
}
