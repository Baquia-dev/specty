// SPDX-License-Identifier: Apache-2.0
import { execFile, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { CONFIG, cli, git, tempRepo, tryGit, writeFiles } from "./support";

/**
 * Claude Code against a scripted model: a fake of Anthropic's Messages API that plays a fixed
 * script of tool calls, and the real agent (Claude Code, headless) run against it, for free and
 * deterministically. The fake reads how far each conversation got from the tool results the agent
 * sends back, and keeps every request.
 */

export interface ToolUse {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** What the agent sent back for one tool call: Specty's guard answers there when it blocks. */
interface ToolResult {
  readonly id: string;
  readonly isError: boolean;
  readonly text: string;
}

export interface FakeModel {
  /** For `ANTHROPIC_BASE_URL`. */
  readonly url: string;
  /** The `POST /v1/messages` requests of the main conversation that carried tools, in order. */
  readonly turns: () => number;
  /** The tool results of the main conversation's last request: the whole conversation's. */
  readonly results: () => readonly ToolResult[];
  /** The same, for the subagent whose task carries `mark`. */
  readonly subagentResults: (mark: string) => readonly ToolResult[];
  readonly close: () => Promise<void>;
}

type Body = Readonly<Record<string, unknown>>;

/**
 * Plays `script` to the main conversation and, to a subagent whose task (its first message)
 * carries one of the marks of `subagents`, that mark's script, each conversation on its own.
 */
async function fakeModel(
  script: readonly ToolUse[],
  subagents: Readonly<Record<string, readonly ToolUse[]>> = {},
): Promise<FakeModel> {
  const bodies: Body[] = [];
  const delegated = new Map<string, Body[]>();
  const marks = Object.keys(subagents);
  const server = createServer((request, response) => {
    void read(request).then((text) => {
      const body = parse(text);
      const url = request.url ?? "";
      if (request.method !== "POST" || !url.includes("/v1/messages")) {
        json(response, {}, 404);
      } else if (url.includes("/v1/messages/count_tokens")) {
        json(response, { input_tokens: 1 });
      } else {
        // Requests without tools (titles, summaries) get the closing text and leave the script.
        const tools = Array.isArray(body.tools) && body.tools.length > 0;
        const task = firstMessage(body);
        const mark = marks.find((candidate) => task.includes(candidate));
        const kept = mark === undefined ? bodies : (delegated.get(mark) ?? []);
        if (tools) kept.push(body);
        if (mark !== undefined) delegated.set(mark, kept);
        const steps = mark === undefined ? script : (subagents[mark] ?? []);
        const done = resultsOf(body).length;
        // Each conversation's calls get ids of their own.
        const prefix = mark === undefined ? "" : `s${marks.indexOf(mark)}_`;
        answer(response, body, tools ? steps[done] : undefined, `${prefix}${done}`);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const lastResults = (kept: readonly Body[] | undefined) => {
    const last = kept?.at(-1);
    return last === undefined ? [] : resultsOf(last);
  };
  return {
    url: `http://127.0.0.1:${port}`,
    turns: () => bodies.length,
    results: () => lastResults(bodies),
    subagentResults: (mark) => lastResults(delegated.get(mark)),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The tool calls a script is made of. */
export const step = {
  write: (path: string, content: string): ToolUse => ({
    name: "Write",
    input: { file_path: path, content },
  }),
  bash: (command: string): ToolUse => ({ name: "Bash", input: { command } }),
  read: (path: string): ToolUse => ({ name: "Read", input: { file_path: path } }),
  /** A subagent launched with a task that carries `mark`, so the fake plays it its own script. */
  delegate: (mark: string, task: string): ToolUse => ({
    name: "Agent",
    input: { description: task, prompt: `${mark}: ${task}`, subagent_type: "general-purpose" },
  }),
};

/** Editors whose Claude Code extension carries the CLI. */
const EDITORS = [".vscode", ".cursor", ".windsurf", ".antigravity-ide"];

/**
 * Claude Code's CLI: `SPECTY_E2E_CLAUDE`, `claude` on the PATH, or the newest one an editor
 * extension carries. Undefined when there is none: the tests skip.
 */
function findClaude(): string | undefined {
  const configured = process.env.SPECTY_E2E_CLAUDE;
  if (configured !== undefined && configured.length > 0) return configured;
  if (spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0) return "claude";
  const bundled = EDITORS.flatMap((editor) => {
    const folder = join(homedir(), editor, "extensions");
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((name) => name.startsWith("anthropic.claude-code-"))
      .flatMap((name) =>
        ["claude", "claude.exe"].map((binary) =>
          join(folder, name, "resources", "native-binary", binary),
        ),
      )
      .filter((path) => existsSync(path));
  });
  return bundled.toSorted((a, b) => compareVersions(versionOf(a), versionOf(b))).at(-1);
}

function versionOf(path: string): number[] {
  const version = /anthropic\.claude-code-(\d+(?:\.\d+)*)/.exec(path)?.[1] ?? "0";
  return version.split(".").map(Number);
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export const CLAUDE = findClaude();

/** A repository set up with `specty init`, so Claude Code runs Specty's real hooks. */
export async function initialized(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  const result = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
  expect(result.code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": CONFIG() });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  return root;
}

/** How a run goes beyond its script: its session's id, and a script per subagent's mark. */
export interface RunOptions {
  readonly session?: string;
  readonly subagents?: Readonly<Record<string, readonly ToolUse[]>>;
}

/**
 * Runs Claude Code headless in `root` against a fake model that plays `script`. Nothing of the
 * person's setup takes part: its own config and home, a fake key, project settings only, no MCP.
 */
export async function claudeWith(
  root: string,
  script: readonly ToolUse[],
  { session, subagents = {} }: RunOptions = {},
): Promise<FakeModel> {
  const model = await fakeModel(script, subagents);
  const delegates = Object.keys(subagents).length > 0;
  const steps = Object.values(subagents).reduce((sum, steps) => sum + steps.length, script.length);
  const home = await mkdtemp(join(tmpdir(), "specty-claude-"));
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, "config"),
    ANTHROPIC_BASE_URL: model.url,
    ANTHROPIC_API_KEY: "sk-ant-specty-e2e",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
    DISABLE_ERROR_REPORTING: "1",
    LANG: "es_ES.UTF-8",
  };
  const args = [
    "-p",
    "Sigue el guion.",
    // With the bundle's absolute path, `init` puts the hooks in the local settings.
    "--setting-sources",
    "project,local",
    "--strict-mcp-config",
    "--tools",
    delegates ? "Write,Bash,Read,Agent" : "Write,Bash",
    "--dangerously-skip-permissions",
    "--max-turns",
    String(steps + 2),
    "--output-format",
    "json",
    "--model",
    "claude-sonnet-4-5",
    ...(session === undefined ? [] : ["--session-id", session]),
  ];
  await new Promise<void>((resolve) => {
    execFile(CLAUDE ?? "claude", args, { cwd: root, env, timeout: 150_000 }, () => resolve());
  });
  await model.close();
  // Had it not reached the fake, it would have gone nowhere: the key is fake.
  expect(model.turns()).toBeGreaterThan(0);
  return model;
}

/** The text of the conversation's first message: a subagent's task. */
function firstMessage(body: Body): string {
  const [first] = Array.isArray(body.messages) ? body.messages : [];
  return isBody(first) ? textOf(first.content) : "";
}

/** The next tool call of the script, or a closing text once it ran out. */
function answer(
  response: ServerResponse,
  body: Body,
  step: ToolUse | undefined,
  index: string,
): void {
  const id = `toolu_${index}`;
  const stop = step === undefined ? "end_turn" : "tool_use";
  const message = {
    id: `msg_${index}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  if (body.stream !== true) {
    const content =
      step === undefined
        ? [{ type: "text", text: "Fin." }]
        : [{ type: "tool_use", id, name: step.name, input: step.input }];
    json(response, { ...message, content, stop_reason: stop });
    return;
  }
  const [start, delta] =
    step === undefined
      ? [
          { type: "text", text: "" },
          { type: "text_delta", text: "Fin." },
        ]
      : [
          { type: "tool_use", id, name: step.name, input: {} },
          { type: "input_json_delta", partial_json: JSON.stringify(step.input) },
        ];
  const events: [string, Body][] = [
    ["message_start", { type: "message_start", message }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: start }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  response.end();
}

/** Every tool result of the conversation in `body`, in order. */
function resultsOf(body: Body): ToolResult[] {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.flatMap((message: unknown) => {
    const content = isBody(message) && Array.isArray(message.content) ? message.content : [];
    return content.flatMap((block: unknown): ToolResult[] =>
      isBody(block) && block.type === "tool_result"
        ? [
            {
              id: String(block.tool_use_id),
              isError: block.is_error === true,
              text: textOf(block.content),
            },
          ]
        : [],
    );
  });
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: unknown) => (isBody(part) ? String(part.text ?? "") : "")).join("");
}

function isBody(value: unknown): value is Body {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(text: string): Body {
  try {
    const value: unknown = JSON.parse(text);
    return isBody(value) ? value : {};
  } catch {
    return {};
  }
}

function read(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    request.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    request.on("end", () => resolve(text));
  });
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
