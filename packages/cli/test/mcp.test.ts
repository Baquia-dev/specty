// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/program";
import { AGENT, APP, cli, DIST, NOW, tempRepo, testEnv } from "./support";

type Message = Record<string, unknown>;

/**
 * `specty mcp` in `cwd`, fed `messages` on stdin in chunks that cut lines in two, as a pipe may:
 * the JSON messages it writes on stdout.
 */
async function serve(cwd: string, messages: readonly (Message | string)[]): Promise<Message[]> {
  const text = messages
    .map((message) => (typeof message === "string" ? message : JSON.stringify(message)))
    .join("\n");
  async function* input() {
    for (let at = 0; at < text.length; at += 7) yield text.slice(at, at + 7);
    yield "\n";
  }
  const out: string[] = [];
  const code = await runCli(["mcp"], {
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: (line) => out.push(line), err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
    stdin: async () => "",
    input: input(),
  });
  expect(code).toBe(0);
  return out.map((line): Message => JSON.parse(line));
}

const request = (id: number, method: string, params: Message = {}): Message => ({
  jsonrpc: "2.0",
  id,
  method,
  params,
});
const call = (id: number, name: string, args: Message = {}) =>
  request(id, "tools/call", { name, arguments: args });
const initialize = (id: number, protocolVersion: string) =>
  request(id, "initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });

const TOOLS = [
  "specty_next",
  "specty_new",
  "specty_propose",
  "specty_review",
  "specty_check",
  "specty_task_done",
  "specty_scope_add",
  "specty_adjust",
  "specty_integrate",
  "specty_retro",
];

describe("specty mcp", () => {
  it("AC1: answers the handshake and ping, ignores notifications, and reports protocol errors", async () => {
    const root = await tempRepo(APP);
    const answers = await serve(root, [
      "not json",
      initialize(1, "2025-06-18"),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      request(2, "ping"),
      request(3, "resources/list"),
      initialize(4, "1999-01-01"),
    ]);
    expect(answers).toHaveLength(5);
    expect(answers[0]).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32700 } });
    expect(answers[1]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "specty", version: expect.any(String) },
      },
    });
    expect(answers[2]).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
    expect(answers[3]).toMatchObject({ id: 3, error: { code: -32601 } });
    expect(answers[4]).toMatchObject({ id: 4, result: { protocolVersion: "2025-11-25" } });
  });

  it("AC2: lists the agent's commands as tools, each with its schema, and no person's action", async () => {
    const root = await tempRepo(APP);
    const [listed] = await serve(root, [request(1, "tools/list")]);
    const tools = (listed?.result as { tools: Message[] } | undefined)?.tools ?? [];
    expect(tools.map((tool) => tool.name)).toEqual(TOOLS);
    for (const tool of tools) {
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        properties: { folder: { type: "string" } },
      });
    }
    expect(tools.find((tool) => tool.name === "specty_new")?.inputSchema).toMatchObject({
      required: ["title"],
    });
  });

  it("AC3: runs each tool as its command, in the folder given, and marks a failing one", async () => {
    const root = await tempRepo(APP);
    const expected = await cli(root, ["next"]);
    const [next, created, proposed, here] = await serve(root, [
      call(1, "specty_next", { folder: root }),
      call(2, "specty_new", { folder: root, title: "Saludo personalizado", request: "Que salude" }),
      call(3, "specty_propose", { folder: root }),
      call(4, "specty_next"),
    ]);
    expect(next).toMatchObject({
      id: 1,
      result: { content: [{ type: "text", text: expected.out }], isError: false },
    });
    expect(JSON.stringify(created)).toContain("Cambio creado");
    expect(created).toMatchObject({ result: { isError: false } });
    // The draft is empty: `propose` refuses it, with the card the CLI gives.
    const refused = await cli(root, ["propose"]);
    expect(refused.code).not.toBe(0);
    expect(proposed).toMatchObject({
      result: { content: [{ type: "text", text: refused.out }], isError: true },
    });
    expect(here).toMatchObject({
      result: { content: [{ text: (await cli(root, ["next"])).out }] },
    });
  });

  it("AC4: refuses an unknown tool or a wrong argument, running nothing", async () => {
    const root = await tempRepo(APP);
    const answers = await serve(root, [
      call(1, "specty_approve"),
      call(2, "specty_new", { request: "Sin título" }),
      call(3, "specty_task_done", { task: 5, summary: "Hecho" }),
    ]);
    expect(answers[0]).toMatchObject({ id: 1, error: { code: -32602 } });
    expect(JSON.stringify(answers[0])).toContain("specty_approve");
    expect(answers[1]).toMatchObject({ id: 2, error: { code: -32602 } });
    expect(JSON.stringify(answers[1])).toContain("title");
    expect(answers[2]).toMatchObject({ id: 3, error: { code: -32602 } });
    expect(JSON.stringify(answers[2])).toContain("task");
    expect(await readdir(join(root, ".specty"))).not.toContain("changes");
  });
});
