// SPDX-License-Identifier: Apache-2.0

/** What a shell command asks of Specty, read from the arguments after the Specty program. */
export interface SpectyCalls {
  /** Specty subcommands it runs (`approve`, `next`…). */
  readonly specty: readonly string[];
  /** The change each `specty enter <id>` names. */
  readonly enters: readonly string[];
  /** Each front of Specty's memory that `specty front take|free <front>` names, in order. */
  readonly fronts: readonly { readonly action: "take" | "free"; readonly name: string }[];
  /** The entries of Specty's memory each `specty new --resolves <id>…` takes, in order. */
  readonly resolves: readonly string[];
  /** The entries of Specty's memory each `specty memory resolve <id>…` takes, in order. */
  readonly memoryResolves: readonly string[];
  /** Each `specty new`, in order, and whether it carries `--subagent`, which binds nobody to it. */
  readonly news: readonly { readonly subagent: boolean }[];
}

const NONE: SpectyCalls = {
  specty: [],
  enters: [],
  fronts: [],
  resolves: [],
  memoryResolves: [],
  news: [],
};

/** What a segment that runs Specty with `args` asks of it; nothing when it does not run Specty. */
export function spectyCalls(args: readonly string[] | undefined): SpectyCalls {
  if (args === undefined) return NONE;
  const name = subcommand(args);
  return {
    specty: name.length > 0 ? [name] : [],
    enters: entered(args),
    fronts: frontRequests(args),
    resolves: resolvedIds(args),
    memoryResolves: memoryResolvedIds(args),
    news: created(args),
  };
}

/** The first word of `args` that is not an option. */
export function subcommand(args: readonly string[]): string {
  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

/** The change `specty enter <id>` names: the first word after `enter` that is not an option. */
function entered(args: readonly string[]): string[] {
  if (subcommand(args) !== "enter") return [];
  const id = args.slice(args.indexOf("enter") + 1).find((arg) => !arg.startsWith("-"));
  return id === undefined ? [] : [id];
}

/** The `specty new` of `args`, and whether it carries `--subagent` wherever commander reads it. */
function created(args: readonly string[]): SpectyCalls["news"] {
  return subcommand(args) === "new" ? [{ subagent: args.includes("--subagent") }] : [];
}

/** The front `specty front take|free <front>` names: the words after `front` that are not options. */
function frontRequests(args: readonly string[]): SpectyCalls["fronts"] {
  if (subcommand(args) !== "front") return [];
  const words = args.slice(args.indexOf("front") + 1).filter((arg) => !arg.startsWith("-"));
  const [action, name] = words;
  return (action === "take" || action === "free") && name !== undefined ? [{ action, name }] : [];
}

/**
 * The ids `specty memory resolve` names: the words after `resolve` that are not options, when
 * `resolve` is the first word after `memory` that is not one.
 */
function memoryResolvedIds(args: readonly string[]): string[] {
  if (subcommand(args) !== "memory") return [];
  const words = args.slice(args.indexOf("memory") + 1).filter((arg) => !arg.startsWith("-"));
  return words[0] === "resolve" ? words.slice(1) : [];
}

/**
 * The ids `specty new --resolves` names: the words after the option up to the next option, as
 * commander reads them, or the value of `--resolves=<id>`.
 */
function resolvedIds(args: readonly string[]): string[] {
  if (subcommand(args) !== "new") return [];
  return args.flatMap((arg, index) => {
    if (arg.startsWith("--resolves=")) return [arg.slice("--resolves=".length)];
    if (arg !== "--resolves") return [];
    const rest = args.slice(index + 1);
    const end = rest.findIndex((word) => word.startsWith("-"));
    return end === -1 ? rest : rest.slice(0, end);
  });
}
