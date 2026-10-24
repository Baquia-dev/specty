// SPDX-License-Identifier: Apache-2.0
import { lookup } from "../lookup";
import { basename } from "../paths";
import { analyzeGit, type GitCommit } from "./git";
import { type Token, tokenize } from "./tokens";

/** What a shell command would do, as far as the flow is concerned. */
export interface ShellAnalysis {
  /** Specty subcommands it runs (`approve`, `next`…). */
  readonly specty: readonly string[];
  /** `npx specty` and similar: they install an unrelated npm package. */
  readonly unscopedNpx: boolean;
  /**
   * One entry per `git commit`; `all` when it also commits tracked changes (`-a`). `directory`
   * says where it runs when a `cd` or `git -C` moves it somewhere the analysis can name (relative
   * to where the command starts, or absolute); without it, it runs where the command starts or
   * somewhere unknown.
   */
  readonly commits: readonly { readonly all: boolean; readonly directory?: string }[];
  /** Skips or disables hooks: `--no-verify`, `core.hooksPath`, `HUSKY=0`… */
  readonly bypass: boolean;
  /** Paths written through redirections, `tee`, `touch`, `cp`, `mv` or `sed -i`. */
  readonly writes: readonly string[];
  /** Paths removed through `rm`, `rmdir` or `mv`. */
  readonly deletes: readonly string[];
  /** Written or removed paths it cannot place: shell variables, `~`, or after `cd` to an unknown directory. */
  readonly unresolved: readonly string[];
}

/** Directory relative to where the command starts (`""`), absolute, or unknown (`undefined`). */
type Directory = string | undefined;

const WRAPPERS: ReadonlySet<string> = new Set(["sudo", "env", "command", "exec", "time", "nohup"]);
const RUNNERS: ReadonlySet<string> = new Set(["node", "bun", "deno"]);
const BYPASS_ENV: Readonly<Record<string, string>> = { HUSKY: "0", LEFTHOOK: "0" };
const SPECTY_PACKAGE = /^@baquia-dev\/specty(?:@[^/]*)?$/;
const UNSCOPED_PACKAGE = /^specty(?:@.*)?$/;
const SPECTY_SCRIPT = /(?:^|\/)specty(?:\.[cm]?js)?$/;

const EMPTY: ShellAnalysis = {
  specty: [],
  unscopedNpx: false,
  commits: [],
  bypass: false,
  writes: [],
  deletes: [],
  unresolved: [],
};

/** What one simple command does, before placing its paths and commits. */
type Segment = Omit<ShellAnalysis, "unresolved" | "commits"> & {
  readonly commits: readonly GitCommit[];
};

/** Paths are relative to where the command starts, following its `cd`s, or absolute. */
export function analyzeShell(command: string): ShellAnalysis {
  let directory: Directory = "";
  // Where to return when each open subshell closes: its `cd`s stay inside it.
  const outer: Directory[] = [];
  let result = EMPTY;
  for (const tokens of tokenize(command)) {
    if (tokens === "(") {
      outer.push(directory);
      continue;
    }
    if (tokens === ")") {
      if (outer.length > 0) directory = outer.pop();
      continue;
    }
    const segment = analyzeSegment(tokens);
    const place = (paths: readonly string[]) => paths.map((path) => locate(directory, path));
    const writes = place(segment.writes);
    const deletes = place(segment.deletes);
    const unresolved = [...writes, ...deletes].filter((item) => item.path === undefined);
    result = merge(result, {
      ...segment,
      commits: segment.commits.map((commit) => placeCommit(directory, commit)),
      writes: writes.flatMap((item) => (item.path === undefined ? [] : [item.path])),
      deletes: deletes.flatMap((item) => (item.path === undefined ? [] : [item.path])),
      unresolved: unresolved.map((item) => item.raw),
    });
    directory = changeDirectory(directory, tokens);
  }
  return result;
}

const UNRESOLVABLE = /[$`]|^~/;

function locate(directory: Directory, raw: string): { raw: string; path: string | undefined } {
  if (UNRESOLVABLE.test(raw)) return { raw, path: undefined };
  if (raw.startsWith("/")) return { raw, path: raw };
  if (directory === undefined) return { raw, path: undefined };
  return { raw, path: directory === "" ? raw : `${directory}/${raw}` };
}

/** The directory after this segment: it only changes on `cd`. */
function changeDirectory(directory: Directory, tokens: readonly Token[]): Directory {
  const words = tokens.filter((token) => !token.operator).map((token) => token.text);
  if (words[0] !== "cd") return directory;
  const target = words.slice(1).find((word) => !word.startsWith("-") || word === "-");
  return target === undefined ? undefined : enter(directory, target);
}

/** The directory `target` names from `directory`, as `cd` and `git -C` read it. */
function enter(directory: Directory, target: string): Directory {
  if (target === "-" || UNRESOLVABLE.test(target)) return undefined;
  if (target.startsWith("/")) return target.replace(/\/+$/, "") || "/";
  if (directory === undefined) return undefined;
  const joined = directory === "" ? target : `${directory}/${target}`;
  return joined.replace(/\/+$/, "");
}

/** A commit runs in its segment's directory, moved by its `-C` options. */
function placeCommit(directory: Directory, commit: GitCommit): ShellAnalysis["commits"][number] {
  const where = commit.moves.reduce<Directory>((from, move) => enter(from, move), directory);
  return where === undefined || where === ""
    ? { all: commit.all }
    : { all: commit.all, directory: where };
}

function analyzeSegment(tokens: readonly Token[]): Segment {
  const { words, redirected } = splitRedirections(tokens);
  const assignments = words.filter(
    (word, index) => isAssignment(word) && words.slice(0, index).every(isAssignment),
  );
  const bypassByEnv = assignments.some((assignment) => {
    const [name, value] = assignment.split("=", 2);
    return name !== undefined && lookup(BYPASS_ENV, name) === value;
  });
  const start = skipWrappers(words, assignments.length);
  const program = basename(words[start] ?? "");
  const args = words.slice(start + 1);
  const git = program === "git" ? analyzeGit(args) : { commits: [], bypass: false };
  const files = program === "" ? { writes: [], deletes: [] } : fileEffects(program, args);
  const specty = spectyArgs(program, args);
  return {
    specty: specty === undefined ? [] : [subcommand(specty)].filter((name) => name.length > 0),
    unscopedNpx: isUnscopedNpx(program, args),
    commits: git.commits,
    bypass: bypassByEnv || git.bypass,
    writes: [...redirected, ...files.writes],
    deletes: files.deletes,
  };
}

function merge(a: ShellAnalysis, b: ShellAnalysis): ShellAnalysis {
  return {
    specty: [...a.specty, ...b.specty],
    unscopedNpx: a.unscopedNpx || b.unscopedNpx,
    commits: [...a.commits, ...b.commits],
    bypass: a.bypass || b.bypass,
    writes: [...a.writes, ...b.writes],
    deletes: [...a.deletes, ...b.deletes],
    unresolved: [...a.unresolved, ...b.unresolved],
  };
}

function splitRedirections(tokens: readonly Token[]): { words: string[]; redirected: string[] } {
  const words: string[] = [];
  const redirected: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (!token.operator) {
      words.push(token.text);
      continue;
    }
    const target = tokens[index + 1];
    index++;
    // Input only: `<`, a heredoc delimiter (`<<`, `<<-`) or a here-string (`<<<`).
    if (token.text.startsWith("<") || target === undefined || target.operator) continue;
    if (target.text === "/dev/null" || /^&\d$/.test(target.text)) continue;
    redirected.push(target.text);
  }
  return { words, redirected };
}

function isAssignment(word: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

function skipWrappers(words: readonly string[], from: number): number {
  const word = words[from];
  if (word === undefined || !WRAPPERS.has(basename(word))) return from;
  const after = words
    .slice(from + 1)
    .findIndex((next) => !next.startsWith("-") && !isAssignment(next));
  return after === -1 ? words.length : skipWrappers(words, from + 1 + after);
}

function nonFlags(args: readonly string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"));
}

function subcommand(args: readonly string[]): string {
  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

/** Arguments after the Specty program, for any way of invoking it. */
function spectyArgs(program: string, args: readonly string[]): readonly string[] | undefined {
  if (program === "specty") return args;
  if (RUNNERS.has(program)) {
    const script = args.findIndex((arg) => !arg.startsWith("-"));
    const path = args[script] ?? "";
    return SPECTY_SCRIPT.test(path) || path.includes("/specty/dist/")
      ? args.slice(script + 1)
      : undefined;
  }
  const runner = packageRunner(program, args);
  if (runner !== undefined) {
    const index = runner.findIndex((arg) => !arg.startsWith("-"));
    return SPECTY_PACKAGE.test(runner[index] ?? "") ? runner.slice(index + 1) : undefined;
  }
  if (program === "pnpm" || program === "npm" || program === "yarn") {
    const [first, second, ...rest] = args;
    if (first === "specty")
      return [second, ...rest].filter((arg): arg is string => arg !== undefined);
    if ((first === "exec" || first === "run") && second === "specty") return rest;
  }
  return undefined;
}

/** Arguments of `npx`, `bunx`, `pnpm dlx` and `yarn dlx`, starting at the package. */
function packageRunner(program: string, args: readonly string[]): readonly string[] | undefined {
  if (program === "npx" || program === "bunx") return args;
  if ((program === "pnpm" || program === "yarn") && args[0] === "dlx") return args.slice(1);
  return undefined;
}

function isUnscopedNpx(program: string, args: readonly string[]): boolean {
  const runner = packageRunner(program, args);
  return runner !== undefined && UNSCOPED_PACKAGE.test(subcommand(runner));
}

function fileEffects(
  program: string,
  args: readonly string[],
): Pick<ShellAnalysis, "writes" | "deletes"> {
  const paths = nonFlags(args);
  switch (program) {
    case "tee":
    case "touch":
      return { writes: paths, deletes: [] };
    case "rm":
    case "rmdir":
    case "unlink":
      return { writes: [], deletes: paths };
    case "cp":
      return { writes: paths.slice(-1), deletes: [] };
    case "mv":
      return { writes: paths.slice(-1), deletes: paths.slice(0, -1) };
    case "sed":
      return { writes: sedTargets(args), deletes: [] };
    default:
      return { writes: [], deletes: [] };
  }
}

/** Files edited in place by `sed -i`: every operand after the script. */
function sedTargets(args: readonly string[]): string[] {
  const inPlace = args.some((arg) => /^(?:-i|--in-place)/.test(arg) || /^-[a-zA-Z]*i/.test(arg));
  if (!inPlace) return [];
  const scripted = args.some((arg) => arg === "-e" || arg === "--expression" || arg === "-f");
  const operands = args.filter((arg, index) => {
    const previous = args[index - 1];
    // BSD sed takes the backup suffix as its own argument: `sed -i '' …` or `sed -i .bak …`.
    const suffix = previous === "-i" && (arg === "" || /^\.\w*$/.test(arg));
    return (
      !suffix &&
      !arg.startsWith("-") &&
      previous !== "-e" &&
      previous !== "--expression" &&
      previous !== "-f"
    );
  });
  return scripted ? operands : operands.slice(1);
}
