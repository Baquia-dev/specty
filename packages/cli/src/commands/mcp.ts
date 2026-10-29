// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import type { Command } from "commander";
import { spectyVersion } from "../check/ci";
import { isRecord } from "../io/files";
import { rendersApps, VIEW_MIME, VIEW_URI, viewData, viewPage } from "../mcp/app";
import {
  failure,
  INVALID_PARAMS,
  type Incoming,
  initialized,
  METHOD_NOT_FOUND,
  parseMessage,
  result,
} from "../mcp/protocol";
import { commandOf, showsView, toolList, VIEW_TOOL } from "../mcp/tools";
import type { CliEnvironment } from "../program";
import type { Terminal } from "../session";

type RunCli = (argv: readonly string[], environment: CliEnvironment) => Promise<number>;

/**
 * What a connection agreed in `initialize`: the view's page, when the client renders MCP Apps
 * and the build wrote it (ADR 0015); without one, the server is as it always was.
 */
interface Connection {
  page: string | undefined;
}

interface Context {
  readonly version: string;
  readonly environment: CliEnvironment;
  readonly runCli: RunCli;
  readonly connection: Connection;
}

/**
 * `specty mcp` (ARCHITECTURE §6): an MCP server over stdio whose tools are the agent's commands.
 * `runCli` comes from the program, which registers this command, so the modules form no cycle.
 */
export function mcpCommand(program: Command, environment: CliEnvironment, runCli: RunCli): void {
  program
    .command("mcp")
    .description("serve the agent's commands as MCP tools over stdio")
    .action(async () => {
      const context = {
        version: await spectyVersion(),
        environment,
        runCli,
        connection: { page: undefined },
      };
      for await (const line of lines(environment.input ?? [])) {
        if (line.trim() === "") continue;
        const answer = await answerTo(parseMessage(line), context);
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
async function answerTo(message: Incoming, context: Context): Promise<string | undefined> {
  switch (message.kind) {
    case "invalid":
      return failure(message.id, message.code, message.message);
    case "notification":
      return undefined;
    case "request":
      break;
  }
  const { id, method, params } = message;
  const { connection } = context;
  switch (method) {
    case "initialize": {
      const { script } = context.environment.invocation;
      connection.page = rendersApps(params) ? await viewPage(script) : undefined;
      return result(id, initialized(params, context.version, connection.page !== undefined));
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: toolList(connection.page !== undefined) });
    case "tools/call":
      return answerCall(id, params, context);
    default:
      return connection.page === undefined
        ? failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
        : answerResource(id, method, params, connection.page);
  }
}

/** A tool's answer: the view's own, or a command's, which also names its folder for the view. */
async function answerCall(
  id: string | number,
  params: Readonly<Record<string, unknown>>,
  context: Context,
): Promise<string> {
  const { environment, runCli, connection } = context;
  const apps = connection.page !== undefined;
  if (apps && params.name === VIEW_TOOL) {
    const asked = isRecord(params.arguments) ? params.arguments.folder : undefined;
    const folder = resolve(environment.cwd, typeof asked === "string" ? asked : ".");
    const data = await viewData(environment, folder);
    const text = data.records.length === 0 ? "No change is open there." : "The change's record.";
    return result(id, {
      content: [{ type: "text", text }],
      structuredContent: data,
      isError: false,
    });
  }
  const command = commandOf(params.name, params.arguments);
  if ("problem" in command) return failure(id, INVALID_PARAMS, command.problem);
  const folder =
    command.folder === undefined ? environment.cwd : resolve(environment.cwd, command.folder);
  const called = await callTool(command.argv, folder, environment, runCli);
  const view = apps && showsView(params.name) ? { structuredContent: { folder } } : {};
  return result(id, { ...called, ...view });
}

/** The view's page, the one resource there is with MCP Apps. */
function answerResource(
  id: string | number,
  method: string,
  params: Readonly<Record<string, unknown>>,
  page: string,
): string {
  switch (method) {
    case "resources/list":
      return result(id, {
        resources: [{ uri: VIEW_URI, name: "specty-change", title: "Specty", mimeType: VIEW_MIME }],
      });
    case "resources/read":
      return params.uri === VIEW_URI
        ? result(id, { contents: [{ uri: VIEW_URI, mimeType: VIEW_MIME, text: page }] })
        : failure(id, INVALID_PARAMS, `Unknown resource: ${String(params.uri)}`);
    default:
      return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/**
 * Runs the command in `folder`, as the CLI would there: its output, captured, is the tool's text,
 * and an exit code of 1 or 2 makes it an error. Its stderr stays on stderr.
 */
async function callTool(
  argv: readonly string[],
  folder: string,
  environment: CliEnvironment,
  runCli: RunCli,
): Promise<Record<string, unknown>> {
  const out: string[] = [];
  const { input: _input, ...rest } = environment;
  const code = await runCli(argv, {
    ...rest,
    cwd: folder,
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
