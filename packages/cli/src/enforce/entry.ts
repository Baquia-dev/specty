// SPDX-License-Identifier: Apache-2.0
import { personAtTerminal } from "@baquia-dev/specty-core";
import type { CliEnvironment } from "../program";
import { openSession, type Terminal } from "../session";
import { type GuardTool, isGuardTool } from "./actions";
import { agentStop } from "./agent-stop";
import { guard } from "./guard";
import { preCommit, prepareCommitMsg } from "./hook";

/** What `main` gives the hooks: the environment, before choosing a terminal or an invocation. */
export type HookBase = Omit<CliEnvironment, "terminal" | "invocation">;

/** `specty guard --tool <id>`: prints the guard's reply and gives its exit code. */
export async function guardCommand(environment: CliEnvironment, tool: GuardTool): Promise<number> {
  const reply = await guard(environment, tool, await environment.stdin());
  if (reply.stdout.length > 0) environment.io.out(reply.stdout);
  if (reply.stderr.length > 0) environment.io.err(reply.stderr);
  return reply.code;
}

/**
 * `specty hook <name> [args…]`, from git's hooks and from the agents' end of turn (`agent-stop
 * <agent>`, with the event on stdin). Outside a Specty repository, git and the agent go on.
 */
export async function hookCommand(
  environment: CliEnvironment,
  name: string,
  args: readonly string[],
): Promise<number> {
  const opened = await openSession(environment);
  if (opened.kind !== "ok") return 0;
  if (name === "pre-commit") return preCommit(opened.session);
  if (name === "agent-stop") {
    const reply = await agentStop(opened.session, args[0] ?? "", await environment.stdin());
    if (reply.length > 0) environment.io.out(reply);
    return 0;
  }
  if (name === "prepare-commit-msg") {
    return prepareCommitMsg(opened.session, args[0] ?? "", args[1]);
  }
  return 0;
}

/**
 * Runs the hidden commands of the hooks without the rest of the CLI, so every agent action and
 * every commit loads only what they need. Only their exact forms (`guard --tool <id>`,
 * `guard --tool=<id>`, `hook <name> [args…]`); anything else gives undefined, for the full CLI.
 */
export async function runHook(
  argv: readonly string[],
  base: HookBase,
): Promise<number | undefined> {
  const [command, ...rest] = argv;
  // Hooks never ask: their terminal only knows whether a person is there.
  const environment: CliEnvironment = {
    ...base,
    terminal: hookTerminal(base.env),
    invocation: { command: "specty", portable: true },
  };
  if (command === "hook" && rest[0] !== undefined && !rest[0].startsWith("-")) {
    return hookCommand(environment, rest[0], rest.slice(1));
  }
  const tool = command === "guard" ? toolOf(rest) : undefined;
  return tool === undefined ? undefined : guardCommand(environment, tool);
}

function toolOf(args: readonly string[]): GuardTool | undefined {
  const value =
    args.length === 2 && args[0] === "--tool"
      ? args[1]
      : args.length === 1 && args[0]?.startsWith("--tool=")
        ? args[0].slice("--tool=".length)
        : undefined;
  return value !== undefined && isGuardTool(value) ? value : undefined;
}

/** Like the CLI's terminal, a TTY whose environment gives an agent away is the agent's. */
export function hookTerminal(env: Readonly<Record<string, string | undefined>>): Terminal {
  return {
    interactive: personAtTerminal(Boolean(process.stdin.isTTY && process.stdout.isTTY), env),
    confirm: async () => false,
    choose: async () => undefined,
    ask: async () => undefined,
    note: () => undefined,
  };
}
