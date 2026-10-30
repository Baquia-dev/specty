// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGit } from "../src/io/git";
import { runCli } from "../src/program";
import { writeRun } from "../src/store/runs";
import { AGENT, APP, CHANGE, cli, DIST, NOW, tempRepo, testEnv } from "./support";

type Message = Record<string, unknown>;

const EXTENSION = "io.modelcontextprotocol/ui";
const MIME = "text/html;profile=mcp-app";
const VIEW = "ui://specty/change";
const PAGE = '<!doctype html><html><head><meta name="specty-data" content="mcp-app"></head></html>';

/** `specty mcp` in `cwd`, run as `script`, fed `messages`: the JSON messages it writes. */
async function serve(
  cwd: string,
  script: string,
  messages: readonly Message[],
): Promise<Message[]> {
  async function* input() {
    yield `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
  }
  const out: string[] = [];
  const code = await runCli(["mcp"], {
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: (line) => out.push(line), err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script },
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
const initialize = (id: number, capabilities: Message) =>
  request(id, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities,
    clientInfo: { name: "host", version: "1" },
  });
const APPS = { extensions: { [EXTENSION]: { mimeTypes: [MIME] } } };

/** A repository with a change in draft, and a bundle folder with `mcp-app.html` unless `pageless`. */
async function setUp(pageless = false) {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  const bundle = await realpath(await mkdtemp(join(tmpdir(), "specty-bundle-")));
  if (!pageless) await writeFile(join(bundle, "mcp-app.html"), PAGE);
  return { root, script: join(bundle, "specty.mjs") };
}

const resultOf = (message: Message | undefined): Message => {
  const value = message?.result;
  if (typeof value !== "object" || value === null)
    throw new Error(`no result: ${JSON.stringify(message)}`);
  return value as Message;
};
const toolsOf = (message: Message | undefined) => resultOf(message).tools as Message[];
const named = (tools: readonly Message[], name: string) => tools.find((tool) => tool.name === name);

describe("specty mcp as an MCP App", () => {
  it("AC3: with the extension, links a change's tools to the view, serves it and gives its data", async () => {
    const { root, script } = await setUp();
    const [init, list, read, view, next] = await serve(root, script, [
      initialize(1, APPS),
      request(2, "tools/list"),
      request(3, "resources/read", { uri: VIEW }),
      call(4, "specty_view", { folder: root }),
      call(5, "specty_next", { folder: root }),
    ]);
    expect(resultOf(init).capabilities).toMatchObject({ resources: {} });
    const tools = toolsOf(list);
    for (const name of ["specty_new", "specty_propose", "specty_next"]) {
      expect(named(tools, name)?._meta, name).toMatchObject({ ui: { resourceUri: VIEW } });
    }
    expect(named(tools, "specty_check")?._meta).toBeUndefined();
    expect(resultOf(read).contents).toMatchObject([{ uri: VIEW, mimeType: MIME, text: PAGE }]);
    const records = (resultOf(view).structuredContent as { records: { state: { id: string } }[] })
      .records;
    expect(records.map((record) => record.state.id)).toEqual([CHANGE]);
    // The view takes the folder from the call's arguments, not from the result (C2, A5).
    expect(resultOf(next).structuredContent).toBeUndefined();
  });

  it("AC9: asks the host to show the view without a frame of its own", async () => {
    const { root, script } = await setUp();
    const [, read] = await serve(root, script, [
      initialize(1, APPS),
      request(2, "resources/read", { uri: VIEW }),
    ]);
    expect(resultOf(read).contents).toEqual([
      { uri: VIEW, mimeType: MIME, text: PAGE, _meta: { ui: { prefersBorder: false } } },
    ]);
  });

  it("AC3: without the extension, or without the page, the tools are today's", async () => {
    const { root, script } = await setUp();
    const plain = await serve(root, script, [
      initialize(1, {}),
      request(2, "tools/list"),
      call(3, "specty_next", { folder: root }),
      request(4, "resources/read", { uri: VIEW }),
    ]);
    const tools = toolsOf(plain[1]);
    expect(tools.some((tool) => tool._meta !== undefined)).toBe(false);
    expect(named(tools, "specty_view")).toBeUndefined();
    expect(resultOf(plain[2]).structuredContent).toBeUndefined();
    expect(plain[3]?.error).toBeDefined();
    const pageless = await setUp(true);
    const [, list] = await serve(pageless.root, pageless.script, [
      initialize(1, APPS),
      request(2, "tools/list"),
    ]);
    expect(toolsOf(list).some((tool) => tool._meta !== undefined)).toBe(false);
  });

  it("AC6: specty_view is only for the app, takes only the folder and changes nothing", async () => {
    const { root, script } = await setUp();
    const state = join(root, ".specty", "changes", CHANGE, "state.json");
    const before = await readFile(state, "utf8");
    const [, list, view] = await serve(root, script, [
      initialize(1, APPS),
      request(2, "tools/list"),
      call(3, "specty_view", { folder: root }),
    ]);
    const tool = named(toolsOf(list), "specty_view");
    expect(tool?._meta).toEqual({ ui: { resourceUri: VIEW, visibility: ["app"] } });
    // Only the folder, the fingerprint of what the view has (C2, A5) and the change it shows (C3,
    // A5): nothing to decide with.
    expect(tool?.inputSchema).toEqual({
      type: "object",
      properties: {
        folder: expect.objectContaining({ type: "string" }),
        since: expect.objectContaining({ type: "string" }),
        change: expect.objectContaining({ type: "string" }),
      },
      required: [],
    });
    expect(resultOf(view).isError).toBe(false);
    expect(await readFile(state, "utf8")).toBe(before);
  });

  it("AC1: with the extension, the agent's tools answer only their card's text", async () => {
    const { root, script } = await setUp();
    const [, next] = await serve(root, script, [
      initialize(1, APPS),
      call(2, "specty_next", { folder: root }),
    ]);
    const result = resultOf(next);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      { type: "text", text: expect.stringContaining(`SPECTY · ${CHANGE}`) },
    ]);
  });

  it("AC2: specty_view says when nothing changed, and gives the run going on, also as JSON text", async () => {
    const { root, script } = await setUp();
    const [, first] = await serve(root, script, [
      initialize(1, APPS),
      call(2, "specty_view", { folder: root }),
    ]);
    const data = resultOf(first).structuredContent as { fingerprint: string; records: unknown[] };
    expect(typeof data.fingerprint).toBe("string");
    expect(data.records).toHaveLength(1);
    const text = (resultOf(first).content as { text: string }[])[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual(data);
    const [, same] = await serve(root, script, [
      initialize(1, APPS),
      call(2, "specty_view", { folder: root, since: data.fingerprint }),
    ]);
    expect(resultOf(same).structuredContent).toEqual({
      fingerprint: data.fingerprint,
      unchanged: true,
    });
    await writeRun(createGit(root, testEnv()), CHANGE, {
      task: "T1",
      command: "npm test",
      startedAt: NOW.toISOString(),
      output: ["✓ greets Ana"],
      pid: process.pid,
    });
    const [, moved] = await serve(root, script, [
      initialize(1, APPS),
      call(2, "specty_view", { folder: root, since: data.fingerprint }),
    ]);
    const now = resultOf(moved).structuredContent as { fingerprint: string };
    expect(now.fingerprint).not.toBe(data.fingerprint);
    expect(now).toMatchObject({
      run: { task: "T1", command: "npm test", output: ["✓ greets Ana"] },
    });
  });
});
