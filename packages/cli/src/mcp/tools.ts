// SPDX-License-Identifier: Apache-2.0
import { CHANGE_KINDS, COMMIT_TYPES } from "@baquia-dev/specty-core";
import { isRecord } from "../io/files";

/**
 * The tools of `specty mcp`: the agent's commands that work in a folder (ARCHITECTURE §6), each
 * with the JSON schema of its arguments and the command line they become. The person's actions
 * have no tool, in delegated mode either.
 */

type Property =
  | { readonly type: "string"; readonly description: string; readonly enum?: readonly string[] }
  | { readonly type: "boolean"; readonly description: string }
  | {
      readonly type: "array";
      readonly items: { readonly type: "string" };
      readonly description: string;
    };

/** Arguments already checked against their tool's schema. */
export type Args = Readonly<Record<string, string | boolean | readonly string[]>>;

interface Tool {
  readonly name: string;
  readonly description: string;
  readonly properties: Readonly<Record<string, Property>>;
  readonly required: readonly string[];
  /** The command line: options first, then `--` before the operands, which may start with `-`. */
  readonly argv: (args: Args) => readonly string[];
}

const text = (description: string): Property => ({ type: "string", description });
const texts = (description: string): Property => ({
  type: "array",
  items: { type: "string" },
  description,
});

const FOLDER = text(
  "Absolute path of the folder to run in: the change's worktree. Default: the server's folder.",
);

/** `--flag value` when `args` has a text for `key`. */
function option(args: Args, key: string, flag: string): string[] {
  const value = args[key];
  return typeof value === "string" ? [flag, value] : [];
}

/** `--flag value` once per text of `key`. */
function repeated(args: Args, key: string, flag: string): string[] {
  const values = args[key];
  return Array.isArray(values) ? values.flatMap((value) => [flag, String(value)]) : [];
}

function operand(args: Args, key: string): string {
  return String(args[key]);
}

const TOOLS: readonly Tool[] = [
  {
    name: "specty_next",
    description:
      "What to do now in this folder's change: its card, ending in NEXT. In implementing, it starts the next task.",
    properties: {},
    required: [],
    argv: () => ["next"],
  },
  {
    name: "specty_new",
    description:
      "Create a change and its spec skeleton, by default in a worktree of its own (its folder is in the card).",
    properties: {
      title: text("The change's title."),
      request: text("The user's literal request, kept as written."),
      kind: { type: "string", description: "The lane.", enum: CHANGE_KINDS },
      type: { type: "string", description: "What the change is.", enum: COMMIT_TYPES },
      follows: texts("Changes this one continues."),
      epic: text("The epic this change is a slice of."),
      slice: text("The epic's slice, such as C2."),
      from: text("The branch to start from."),
    },
    required: ["title"],
    argv: (args) => [
      "new",
      ...option(args, "request", "--request"),
      ...option(args, "kind", "--kind"),
      ...option(args, "type", "--type"),
      ...option(args, "epic", "--epic"),
      ...option(args, "slice", "--slice"),
      ...option(args, "from", "--from"),
      ...repeated(args, "follows", "--follows"),
      "--",
      operand(args, "title"),
    ],
  },
  {
    name: "specty_propose",
    description: "Validate the spec (or the tests, or the closing) and send it to the person.",
    properties: {},
    required: [],
    argv: () => ["propose"],
  },
  {
    name: "specty_review",
    description:
      "An independent review of the spec, or of the result, by the command the person set up.",
    properties: {},
    required: [],
    argv: () => ["review"],
  },
  {
    name: "specty_check",
    description: "Run the quality checks: on what changed (default), what is staged or everything.",
    properties: {
      mode: { type: "string", description: "What to check.", enum: ["changed", "staged", "all"] },
      spec: { type: "boolean", description: "Also what the approved plan of the change allows." },
      verbose: { type: "boolean", description: "Every finding and what passed." },
    },
    required: [],
    argv: (args) => [
      "check",
      ...(typeof args.mode === "string" ? [`--${args.mode}`] : []),
      ...(args.spec === true ? ["--spec"] : []),
      ...(args.verbose === true ? ["--verbose"] : []),
    ],
  },
  {
    name: "specty_task_done",
    description:
      "Complete the active task: check its scope, run its checks and verification, commit it and move on.",
    properties: {
      task: text("The task, such as T1."),
      summary: text("What the task did, in 300 characters at most."),
      findings: texts("What the task learned, for the next ones."),
    },
    required: ["task", "summary"],
    argv: (args) => [
      "task",
      "done",
      ...option(args, "summary", "--summary"),
      ...repeated(args, "findings", "--finding"),
      "--",
      operand(args, "task"),
    ],
  },
  {
    name: "specty_scope_add",
    description: "Ask to widen the active task's scope with paths outside it.",
    properties: {
      paths: texts("The paths the task needs."),
      reason: text("Why the task needs them."),
      task: text("The task, by default the active one."),
    },
    required: ["paths", "reason"],
    argv: (args) => [
      "scope",
      "add",
      ...option(args, "reason", "--reason"),
      ...option(args, "task", "--task"),
      "--",
      ...(Array.isArray(args.paths) ? args.paths.map(String) : []),
    ],
  },
  {
    name: "specty_adjust",
    description: "Record the user's adjustment request in acceptance and get how to classify it.",
    properties: { request: text("The user's literal request.") },
    required: ["request"],
    argv: (args) => ["adjust", "--", operand(args, "request")],
  },
  {
    name: "specty_integrate",
    description: "Finish the merge of the target branch that a closing left in this folder.",
    properties: {},
    required: [],
    argv: () => ["integrate"],
  },
  {
    name: "specty_retro",
    description:
      "Document staged changes made without a spec: separately, or with `into` as a scope request of the active change.",
    properties: {
      into: text("The folder's active change, to document them in."),
      reason: text("With `into`: why the changes were made."),
    },
    required: [],
    argv: (args) => [
      "retro",
      ...option(args, "into", "--into"),
      ...option(args, "reason", "--reason"),
    ],
  },
];

/** What `tools/list` answers: each tool with the JSON schema of its arguments. */
export function toolList(): Record<string, unknown>[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      properties: { ...tool.properties, folder: FOLDER },
      required: tool.required,
    },
  }));
}

/** The command line of a call, or why the call is wrong. */
export function commandOf(
  name: unknown,
  raw: unknown,
):
  | { readonly argv: readonly string[]; readonly folder: string | undefined }
  | { readonly problem: string } {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) return { problem: `Unknown tool: ${String(name)}` };
  const checked = argsOf(tool, raw);
  if ("problem" in checked) return checked;
  const { folder } = checked.args;
  return {
    argv: tool.argv(checked.args),
    folder: typeof folder === "string" ? folder : undefined,
  };
}

/** The arguments of a call that fit its tool's schema, `folder` included; unknown ones are left out. */
function argsOf(tool: Tool, raw: unknown): { readonly args: Args } | { readonly problem: string } {
  const given = isRecord(raw) ? raw : {};
  const args: Record<string, string | boolean | readonly string[]> = {};
  for (const [key, property] of Object.entries({ ...tool.properties, folder: FOLDER })) {
    const value = given[key];
    if (value === undefined) {
      if (tool.required.includes(key)) return { problem: `Missing argument "${key}"` };
      continue;
    }
    const problem = problemOf(key, property, value);
    if (problem !== undefined) return { problem };
    if (isArg(value)) args[key] = value;
  }
  return { args };
}

function isArg(value: unknown): value is string | boolean | readonly string[] {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

/** Why `value` does not fit `property`, if it does not. */
function problemOf(key: string, property: Property, value: unknown): string | undefined {
  switch (property.type) {
    case "string":
      if (typeof value !== "string") return `Argument "${key}" must be a string`;
      return property.enum === undefined || property.enum.includes(value)
        ? undefined
        : `Argument "${key}" must be one of ${property.enum.join(", ")}`;
    case "boolean":
      return typeof value === "boolean" ? undefined : `Argument "${key}" must be a boolean`;
    case "array":
      return Array.isArray(value) && value.every((item) => typeof item === "string")
        ? undefined
        : `Argument "${key}" must be an array of strings`;
  }
}
