// SPDX-License-Identifier: Apache-2.0
import { writtenRefs } from "./git-refs";

/** A `git commit`, before placing where it runs. */
export interface GitCommit {
  /** It also commits tracked changes (`-a`). */
  readonly all: boolean;
  /** The folders of its `-C` options, in order. */
  readonly moves: readonly string[];
}

/** What a `git` invocation means for the flow. */
export interface GitEffects {
  readonly commits: readonly GitCommit[];
  /** Skips or disables hooks: `--no-verify`, or setting `core.hooksPath`. */
  readonly bypass: boolean;
  /** The branches it writes, deletes, pushes or checks out (`writtenRefs`). */
  readonly refs: readonly string[];
}

const HOOKS_PATH = /^core\.hookspath/i;
/** `git config` subcommands and options that only read. */
const READS: ReadonlySet<string> = new Set([
  "get",
  "list",
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "--list",
  "-l",
]);
/** `git config` subcommands and options that change values. */
const WRITES: ReadonlySet<string> = new Set([
  "set",
  "unset",
  "rename-section",
  "remove-section",
  "edit",
  "--add",
  "--replace-all",
  "--unset",
  "--unset-all",
  "--rename-section",
  "--remove-section",
  "--edit",
  "-e",
]);
/** `git config` options whose value is the next argument. */
const VALUED: ReadonlySet<string> = new Set([
  "-f",
  "--file",
  "--blob",
  "--type",
  "--default",
  "--comment",
  "--value",
  "--url",
]);

/** Reads the arguments after `git`. */
export function analyzeGit(args: readonly string[]): GitEffects {
  const options = leadingOptions(args);
  const bypassOption = options.values.some((value) => HOOKS_PATH.test(value));
  const command = args[options.end];
  const rest = args.slice(options.end + 1);
  if (command === "commit") {
    const short = rest.filter((arg) => /^-[a-zA-Z]+$/.test(arg));
    const skip = rest.includes("--no-verify") || short.some((flag) => flag.includes("n"));
    const all = rest.includes("--all") || short.some((flag) => flag.includes("a"));
    return { commits: [{ all, moves: options.moves }], bypass: bypassOption || skip, refs: [] };
  }
  const configures =
    command === "config" && rest.some((arg) => HOOKS_PATH.test(arg)) && !onlyReads(rest);
  return { commits: [], bypass: bypassOption || configures, refs: writtenRefs(command, rest) };
}

/** The options before the git command that take the next argument as their value. */
const LEADING_VALUED: ReadonlySet<string> = new Set(["-c", "-C", "--git-dir", "--work-tree"]);

/** Options before the git command: their values, and the folders of `-C`. */
function leadingOptions(args: readonly string[]): {
  end: number;
  values: string[];
  moves: string[];
} {
  const values: string[] = [];
  const moves: string[] = [];
  let index = 0;
  while (args[index]?.startsWith("-") === true) {
    const option = args[index] ?? "";
    if (LEADING_VALUED.has(option)) {
      const value = args[index + 1] ?? "";
      values.push(value);
      if (option === "-C") moves.push(value);
    }
    index += LEADING_VALUED.has(option) ? 2 : 1;
  }
  return { end: index, values, moves };
}

/** `git config` that only reads: `get`, `list`, `--get…`, `--list`, or a key alone. */
function onlyReads(args: readonly string[]): boolean {
  const operands = args.filter(
    (arg, index) => !arg.startsWith("-") && !VALUED.has(args[index - 1] ?? ""),
  );
  // A subcommand comes first; a later operand is a key or a value.
  const verbs = [operands[0] ?? "", ...args.filter((arg) => arg.startsWith("-"))];
  if (verbs.some((verb) => WRITES.has(verb))) return false;
  if (verbs.some((verb) => READS.has(verb))) return true;
  // `git config <key>` reads it; `git config <key> <value>` sets it.
  return operands.length <= 1;
}
