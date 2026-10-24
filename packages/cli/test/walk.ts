// SPDX-License-Identifier: Apache-2.0
import type { Terminal } from "../src/session";
import { AGENT, cli, person, type Run } from "./support";

/**
 * A walk through a change that does what an agent does: it runs `specty next`, then the command
 * each output names in its SIGUIENTE, with the work that command needs done first by a script.
 * It classifies every block it meets and counts the commands, as a measure of friction.
 */

/** Commands a person runs, unless delegated mode lets the agent run them. */
const PERSON: ReadonlySet<string> = new Set(["approve", "accept", "close", "cancel", "reject"]);

/** Steps a block has to reach an output that is not blocked. */
const RESOLVE_WITHIN = 4;
const MAX_STEPS = 60;

/** A tool call the agent tries, which the guard judges as Claude Code's hook would. */
export interface ToolCall {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface Step {
  readonly who: "agent" | "person" | "guard";
  /** The command, or the tool the agent tried. */
  readonly what: string;
  readonly code: number;
  /** The command its SIGUIENTE names, if any. */
  readonly next?: readonly string[];
}

/** What the agent does before a command its SIGUIENTE named. */
export interface Before {
  /** The command with its placeholders filled in. */
  readonly argv: readonly string[];
  /** A tool call the agent tries first; the walk follows the guard's answer if it blocks. */
  readonly tool?: ToolCall;
}

export interface Script {
  /** Writes what `argv` needs (a spec, a task's code, a closing) given the output that named it. */
  readonly before: (argv: readonly string[], output: string) => Promise<Before>;
  /** A tool call the agent tries before anything else. */
  readonly first?: ToolCall;
}

export type Verdict = "resolved" | "no-continuation" | "dead-end";

export interface Friction {
  /** Commands the agent ran, `next` included, and tool calls the guard blocked. */
  readonly agent: number;
  readonly person: number;
  readonly blockedTools: number;
  /** Outputs that blocked, refused or rejected the step. */
  readonly blocks: number;
  /** Commands until the spec was approved. */
  readonly toApproval: { readonly agent: number; readonly person: number };
}

export interface Walk {
  readonly steps: readonly Step[];
  readonly done: boolean;
  /** One per block, in order. */
  readonly verdicts: readonly Verdict[];
  readonly friction: Friction;
}

/** Walks the change in `root` by following each SIGUIENTE until it is done. */
export async function walk(root: string, script: Script, delegated = false): Promise<Walk> {
  const steps: Step[] = [];
  const record = (who: Step["who"], what: string, run: Run): string => {
    const output = `${run.out}\n${run.err}`;
    const next = nextCommand(output);
    steps.push({ who, what, code: run.code, ...(next !== undefined ? { next } : {}) });
    return output;
  };
  const tryTool = async (call: ToolCall): Promise<string | undefined> => {
    const output = record("guard", call.tool, await guard(root, call));
    return steps.at(-1)?.code === 0 ? undefined : output;
  };
  let output =
    (script.first === undefined ? undefined : await tryTool(script.first)) ??
    record("agent", "next", await cli(root, ["next"]));
  let approvedAt: number | undefined;
  while (steps.length < MAX_STEPS && !isDone(output)) {
    const named = nextCommand(output);
    if (named === undefined) break;
    const { argv, tool } = await script.before(named, output);
    const blocked = tool === undefined ? undefined : await tryTool(tool);
    if (blocked !== undefined) {
      output = blocked;
      continue;
    }
    const verb = argv[0] ?? "";
    const who = PERSON.has(verb) && !delegated ? "person" : "agent";
    const terminal: Terminal = who === "person" ? person({ choose: ["confirm"] }) : AGENT;
    output = record(who, argv.join(" "), await cli(root, argv, { terminal }));
    if (approvedAt === undefined && verb === "approve" && steps.at(-1)?.code === 0) {
      approvedAt = steps.length;
    }
  }
  return {
    steps,
    done: isDone(output),
    verdicts: verdicts(steps),
    friction: friction(steps, approvedAt ?? steps.length),
  };
}

/** The command the SIGUIENTE line of `output` names first, as an argument list. */
export function nextCommand(output: string): string[] | undefined {
  const line = output.split("\n").findLast((text) => text.startsWith("SIGUIENTE:"));
  const command = line === undefined ? undefined : /`specty ([^`]+)`/.exec(line)?.[1];
  if (command === undefined) return undefined;
  return [...command.matchAll(/"[^"]*"|\S+/g)].map(([word]) =>
    word.startsWith('"') ? word.slice(1, -1) : word,
  );
}

/** The phase in the header of `output`: `SPECTY · <id> · <phase>`. */
export function phaseOf(output: string): string | undefined {
  return /^SPECTY · \S+ · (\w+)/m.exec(output)?.[1];
}

function isDone(output: string): boolean {
  return phaseOf(output) === "done";
}

/** A block is resolved when an output that does not block comes within a few steps after it. */
function verdicts(steps: readonly Step[]): Verdict[] {
  return steps.flatMap((step, index): Verdict[] => {
    if (step.code === 0) return [];
    if (step.next === undefined) return ["no-continuation"];
    const after = steps.slice(index + 1, index + 1 + RESOLVE_WITHIN);
    return [after.some((later) => later.code === 0) ? "resolved" : "dead-end"];
  });
}

function friction(steps: readonly Step[], approvedAt: number): Friction {
  const count = (from: readonly Step[], who: Step["who"]) =>
    from.filter((step) => step.who === who).length;
  const blockedTools = steps.filter((step) => step.who === "guard" && step.code !== 0).length;
  const untilApproval = steps.slice(0, approvedAt);
  return {
    agent: count(steps, "agent") + blockedTools,
    person: count(steps, "person"),
    blockedTools,
    blocks: steps.filter((step) => step.code !== 0).length,
    toApproval: {
      agent:
        count(untilApproval, "agent") +
        untilApproval.filter((step) => step.who === "guard" && step.code !== 0).length,
      person: count(untilApproval, "person"),
    },
  };
}

function guard(root: string, call: ToolCall): Promise<Run> {
  return cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd: root, tool_name: call.tool, tool_input: call.input }),
  });
}
