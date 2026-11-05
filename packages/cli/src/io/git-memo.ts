// SPDX-License-Identifier: Apache-2.0

/**
 * How long a `Git` keeps an answer about the branch, HEAD, the configuration or the worktrees:
 * enough for the questions one command repeats, short enough for what another process changes
 * in between, as the server of `specty ui` keeps one `Git` for hours.
 */
export const RECENT_MS = 2000;

/** Answers a `Git` keeps for a while, forgotten together when it runs a command that changes them. */
export interface Recall {
  /** `ask`, answered once per key while its answer is recent; a rejected answer is not kept. */
  keep<T>(ask: (key: string) => Promise<T>): (key: string) => Promise<T>;
  forget(): void;
}

export function recall(ttlMs: number = RECENT_MS, now: () => number = () => Date.now()): Recall {
  const clears: (() => void)[] = [];
  return {
    keep<T>(ask: (key: string) => Promise<T>) {
      const answers = new Map<string, { readonly at: number; readonly value: Promise<T> }>();
      clears.push(() => answers.clear());
      return (key) => {
        const known = answers.get(key);
        if (known !== undefined && now() - known.at < ttlMs) return known.value;
        const value = ask(key);
        answers.set(key, { at: now(), value });
        value.catch(() => {
          if (answers.get(key)?.value === value) answers.delete(key);
        });
        return value;
      };
    },
    forget() {
      for (const clear of clears) clear();
    },
  };
}

/** Commands that never move a ref, write the configuration or add or remove a worktree. */
const READS: ReadonlySet<string> = new Set([
  "rev-parse",
  "diff",
  "ls-files",
  "ls-tree",
  "log",
  "show",
  "cat-file",
  "merge-base",
  "status",
  "for-each-ref",
  "write-tree",
  "read-tree",
]);
const CONFIG_READS: ReadonlySet<string> = new Set([
  "--get",
  "--get-all",
  "--get-regexp",
  "--list",
  "-l",
]);

/** Commands that only read in some forms: whether their arguments after the command change something. */
const CHANGES_WHEN: ReadonlyMap<string, (rest: readonly string[]) => boolean> = new Map([
  ["config", (rest: readonly string[]) => !rest.some((arg) => CONFIG_READS.has(arg))],
  [
    "symbolic-ref",
    (rest: readonly string[]) =>
      rest.includes("-d") ||
      rest.includes("--delete") ||
      rest.filter((arg) => !arg.startsWith("-")).length > 1,
  ],
  ["worktree", (rest: readonly string[]) => rest[0] !== "list"],
]);

/** Where the command is in git `args`: git's own options go before it, and `-c` and `-C` take a value. */
function commandAt(args: readonly string[]): number {
  let at = 0;
  while (args[at]?.startsWith("-") === true) at += args[at] === "-c" || args[at] === "-C" ? 2 : 1;
  return at;
}

/**
 * Whether git `args` can change what a `Git` recalls: the branch, HEAD, the configuration or the
 * worktrees. Unknown commands can.
 */
export function mayChangeRecalled(args: readonly string[]): boolean {
  const at = commandAt(args);
  const command = args[at];
  if (command === undefined) return true;
  if (READS.has(command)) return false;
  return CHANGES_WHEN.get(command)?.(args.slice(at + 1)) ?? true;
}
