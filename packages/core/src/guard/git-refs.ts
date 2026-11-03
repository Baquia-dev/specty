// SPDX-License-Identifier: Apache-2.0
import { lookup } from "../lookup";

// The branches a git command writes, deletes, pushes or checks out, so the guard can keep agents
// off the branch of Specty's memory (ADR 0016). Best effort, like every shell rule of the guard.

/** Every branch, or branches that cannot be known. */
export const EVERY_BRANCH = "*";

/** A git command's arguments: operands before `--`, flags, and the value of each valued option. */
interface Parsed {
  readonly operands: readonly string[];
  readonly flags: readonly string[];
  readonly values: readonly (readonly [string, string])[];
}

interface Reader {
  /** Options whose value is the next argument. */
  readonly valued: ReadonlySet<string>;
  readonly read: (parsed: Parsed) => string[];
}

/** `git branch` options that only list: then its operands are patterns or commits. */
const LISTS = new Set([
  "--list",
  "-l",
  "-a",
  "--all",
  "-r",
  "--remotes",
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
  "--show-current",
  "-v",
  "-vv",
  "--verbose",
]);
/** `git branch` options after which every operand is a branch it changes. */
const CHANGES_ALL = new Set(["-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy"]);
/** `git switch`, `checkout` and `worktree add` options whose value is a branch they create. */
const CREATES = new Set(["-c", "-C", "--create", "--force-create", "--orphan", "-b", "-B"]);

const CHECKOUT: Reader = {
  valued: CREATES,
  read: ({ operands, values }) => refs(created(values) ?? operands.slice(0, 1)),
};

const READERS: Readonly<Record<string, Reader>> = {
  "update-ref": {
    valued: new Set(["-m"]),
    read: ({ operands, flags }) =>
      flags.includes("--stdin") ? [EVERY_BRANCH] : refs(operands.slice(0, 1)),
  },
  branch: {
    valued: new Set(["-u", "--set-upstream-to", "--format", "--sort", "--points-at"]),
    read: ({ operands, flags }) => {
      if (flags.some((flag) => CHANGES_ALL.has(flag))) return refs(operands);
      return flags.some((flag) => LISTS.has(flag)) ? [] : refs(operands.slice(0, 1));
    },
  },
  push: {
    valued: new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]),
    read: ({ operands, flags }) =>
      flags.includes("--all") || flags.includes("--mirror")
        ? [EVERY_BRANCH]
        : refs(operands.slice(1).flatMap((spec) => spec.split(":"))),
  },
  fetch: {
    valued: new Set([
      "--depth",
      "--deepen",
      "--shallow-since",
      "--shallow-exclude",
      "-j",
      "--jobs",
    ]),
    read: ({ operands }) =>
      refs(
        operands.slice(1).flatMap((spec) => (spec.includes(":") ? spec.split(":").slice(1) : [])),
      ),
  },
  switch: CHECKOUT,
  checkout: CHECKOUT,
  worktree: {
    valued: new Set(["-b", "-B", "--reason"]),
    read: ({ operands, values }) =>
      operands[0] === "add" ? refs(created(values) ?? operands.slice(2, 3)) : [],
  },
};

/** The branches `git <command> <args>` writes, deletes, pushes or checks out, normalized. */
export function writtenRefs(command: string | undefined, args: readonly string[]): string[] {
  const reader = command === undefined ? undefined : lookup(READERS, command);
  return reader === undefined ? [] : reader.read(parse(reader.valued, args));
}

/** The branch a `-c`, `-b` or similar option creates, if one does. */
function created(values: Parsed["values"]): string[] | undefined {
  const branch = values.find(([option]) => CREATES.has(option));
  return branch === undefined ? undefined : [branch[1]];
}

function parse(valued: ReadonlySet<string>, args: readonly string[]): Parsed {
  const operands: string[] = [];
  const flags: string[] = [];
  const values: (readonly [string, string])[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === "--") break;
    if (!arg.startsWith("-") || arg === "-") operands.push(arg);
    else if (valued.has(arg)) values.push([arg, args[++index] ?? ""]);
    else flags.push(arg.split("=")[0] ?? arg);
  }
  return { operands, flags, values };
}

/** Branch names without `+`, `refs/heads/` or `heads/`; empty ones left out. */
function refs(names: readonly string[]): string[] {
  return names
    .map((name) => name.replace(/^\+/, "").replace(/^(?:refs\/)?heads\//, ""))
    .filter((name) => name.length > 0);
}
