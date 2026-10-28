// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import type { Command } from "commander";
import { spectyVersion } from "../check/ci";
import {
  failure,
  INVALID_PARAMS,
  type Incoming,
  initialized,
  METHOD_NOT_FOUND,
  parseMessage,
  result,
} from "../mcp/protocol";
import { commandOf, toolList } from "../mcp/tools";
import type { CliEnvironment } from "../program";
import type { Terminal } from "../session";

type RunCli = (argv: readonly string[], environment: CliEnvironment) => Promise<number>;

/**
 * `specty mcp` (ARCHITECTURE §6): an MCP server over stdio whose tools are the agent's commands.
 * `runCli` comes from the program, which registers this command, so the modules form no cycle.
 */
export function mcpCommand(program: Command, environment: CliEnvironment, runCli: RunCli): void {
  program
    .command("mcp")
    .description("serve the agent's commands as MCP tools over stdio")
    .action(async () => {
      const version = await spectyVersion();
      for await (const line of lines(environment.input ?? [])) {
        if (line.trim() === "") continue;
        const answer = await answerTo(parseMessage(line), version, environment, runCli);
        if (answer !== undefined) environment.io.out(answer);
      }
    });
}

/** The lines of `input`, whose chunks may cut a line, or a character, in two. */
async function* lines(
  input: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of input) {
    pending += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    yield* parts;
  }
  pending += decoder.decode();
  if (pending !== "") yield pending;
}

/** The answer to a message, or none for a notification. */
async function answerTo(
  message: Incoming,
  version: string,
  environment: CliEnvironment,
  runCli: RunCli,
): Promise<string | undefined> {
  switch (message.kind) {
    case "invalid":
      return failure(message.id, message.code, message.message);
    case "notification":
      return undefined;
    case "request":
      break;
  }
  const { id, method, params } = message;
  switch (method) {
    case "initialize":
      return result(id, initialized(params, version));
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: toolList() });
    case "tools/call": {
      const command = commandOf(params.name, params.arguments);
      if ("problem" in command) return failure(id, INVALID_PARAMS, command.problem);
      return result(id, await callTool(command.argv, command.folder, environment, runCli));
    }
    default:
      return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/**
 * Runs the command in `folder` (or the server's), as the CLI would there: its output, captured,
 * is the tool's text, and an exit code of 1 or 2 makes it an error. Its stderr stays on stderr.
 */
async function callTool(
  argv: readonly string[],
  folder: string | undefined,
  environment: CliEnvironment,
  runCli: RunCli,
): Promise<Record<string, unknown>> {
  const out: string[] = [];
  const { input: _input, ...rest } = environment;
  const code = await runCli(argv, {
    ...rest,
    cwd: folder === undefined ? environment.cwd : resolve(environment.cwd, folder),
    io: { out: (text) => out.push(text), err: environment.io.err },
    terminal: nobodyAnswers(environment),
    stdin: async () => "",
  });
  return { content: [{ type: "text", text: out.join("\n") }], isError: code !== 0 };
}

/** Stdin carries the protocol, so a tool's command must never ask: nobody answers. */
function nobodyAnswers(environment: CliEnvironment): Terminal {
  return {
    interactive: false,
    confirm: async () => false,
    choose: async () => undefined,
    chooseMany: async () => undefined,
    ask: async () => undefined,
    note: (title, text) => environment.io.err(`${title}\n${text}`),
  };
}
