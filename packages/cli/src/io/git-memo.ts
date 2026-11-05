// SPDX-License-Identifier: Apache-2.0
import type { ExecResult } from "./exec";

/**
 * How long a `Git` keeps an answer that depends only on refs, objects or the configuration:
 * enough for the questions one command repeats, short enough for what another process changes
 * in between, as the server of `specty ui` keeps one `Git` for hours.
 */
export const RECENT_MS = 2000;

/** The answers to one question, by key, while they are recent. */
interface Kept<T> {
  /** Asks once per key while its answer is recent; a rejected answer is not kept. */
  get(key: string): Promise<T>;
  /** Takes `value` as the answer for `key`, as if it had just been asked. */
  remember(key: string, value: T): void;
}

/** Answers a `Git` keeps for a while, forgotten together when it runs a command that changes them. */
export interface Recall {
  keep<T>(ask: (key: string) => Promise<T>): Kept<T>;
  forget(): void;
}

function recall(ttlMs: number = RECENT_MS, now: () => number = () => Date.now()): Recall {
  const clears: (() => void)[] = [];
  return {
    keep<T>(ask: (key: string) => Promise<T>): Kept<T> {
      const answers = new Map<string, { readonly at: number; readonly value: Promise<T> }>();
      clears.push(() => answers.clear());
      return {
        get(key) {
          const known = answers.get(key);
          if (known !== undefined && now() - known.at < ttlMs) return known.value;
          const value = ask(key);
          answers.set(key, { at: now(), value });
          value.catch(() => {
            if (answers.get(key)?.value === value) answers.delete(key);
          });
          return value;
        },
        remember(key, value) {
          answers.set(key, { at: now(), value: Promise.resolve(value) });
        },
      };
    },
    forget() {
      for (const clear of clears) clear();
    },
  };
}

/** Reads whose answer depends only on refs, objects or the configuration, never on the folder. */
const REF_READS: ReadonlySet<string> = new Set([
  "rev-parse",
  "log",
  "merge-base",
  "for-each-ref",
  "ls-tree",
  "show-ref",
]);

/**
 * Commands that never move a ref, write the configuration or add or remove a worktree: the
 * reads, and the ones that only write the index or objects.
 */
const READS: ReadonlySet<string> = new Set([
  ...REF_READS,
  "diff",
  "ls-files",
  "show",
  "cat-file",
  "status",
  "write-tree",
  "read-tree",
  "add",
  "update-index",
  "hash-object",
  "commit-tree",
  "mktree",
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

/**
 * Whether a `Git` may recall the answer to git `args`: a read that depends only on refs, objects
 * or the configuration, and names no path of the index (`:path`).
 */
function recallable(args: readonly string[]): boolean {
  const at = commandAt(args);
  const command = args[at];
  if (command === undefined || args.slice(at + 1).some((arg) => arg.startsWith(":"))) return false;
  return REF_READS.has(command) || (CHANGES_WHEN.has(command) && !mayChangeRecalled(args));
}

/** What a git command runs with besides its arguments. */
interface GitOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly input?: string;
}

/** Runs git commands through what it recalls, and takes an answer as if git had just given it. */
export interface Recalling {
  run(args: readonly string[], options?: GitOptions): Promise<ExecResult>;
  remember(args: readonly string[], result: ExecResult): void;
  /** Forgets every recalled answer: what another process changed counts from now on. */
  forget(): void;
}

/** One argument list as a key: git's arguments never hold a NUL. */
const keyOf = (args: readonly string[]) => args.join("\0");

/**
 * `ask` (which runs git) with a `recall`: a recallable read without its own environment or input
 * is answered once while recent, and any command that may change what is recalled forgets it,
 * before and after, for an answer asked while it ran.
 */
export function recalling(
  ask: (args: readonly string[], options: GitOptions) => Promise<ExecResult>,
  memory: Recall = recall(),
): Recalling {
  const recent = memory.keep((key) => ask(key.split("\0"), {}));
  return {
    async run(args, options = {}) {
      if (options.env === undefined && options.input === undefined && recallable(args))
        return recent.get(keyOf(args));
      const changes = mayChangeRecalled(args);
      if (changes) memory.forget();
      const result = await ask(args, options);
      if (changes) memory.forget();
      return result;
    },
    remember: (args, result) => recent.remember(keyOf(args), result),
    forget: () => memory.forget(),
  };
}

/** HEAD's commit and its branch, `HEAD` when it is detached. */
export interface OpenedHead {
  readonly commit: string;
  readonly branch: string;
}

/** HEAD and its branch, as git would answer the questions that ask for them. */
export function rememberHead(git: Pick<Recalling, "remember">, head: OpenedHead): void {
  const answer = (code: number, stdout: string): ExecResult => ({
    code,
    stdout,
    stderr: "",
    timedOut: false,
  });
  git.remember(["rev-parse", "--verify", "-q", "HEAD"], answer(0, `${head.commit}\n`));
  git.remember(["rev-parse", "HEAD"], answer(0, `${head.commit}\n`));
  // Detached, `symbolic-ref -q` fails without a word.
  const branch = head.branch === "HEAD" ? answer(1, "") : answer(0, `${head.branch}\n`);
  git.remember(["symbolic-ref", "--short", "-q", "HEAD"], branch);
}
