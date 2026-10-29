// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * The agents of the suite: how to find each one, its command line without an interface, and how
 * to count its tool calls (rounds) and the guard's refusals (blocks) in its transcript. Claude
 * Code's count is exact; the others' is by pattern, since their formats change between versions.
 * No command line takes the options that skip an agent's sandbox or its permissions.
 */

export type AgentId = "claude-code" | "codex" | "gemini-cli" | "opencode" | "cursor";

export interface Agent {
  readonly id: AgentId;
  readonly name: string;
  /** Its binary: `SPECTY_EVALS_<ID>`, on the PATH or, for Claude Code, in an editor's extension. */
  find(env: NodeJS.ProcessEnv): string | undefined;
  /**
   * The command line that runs `prompt` without an interface, in the folder it starts in, with
   * `turns` of the model at most where the agent takes a limit (30 by default).
   */
  command(binary: string, prompt: string, turns?: number): string[];
}

interface Counts {
  readonly rounds: number;
  readonly blocks: number;
}

/** What a run cost, and the largest context its main thread read: its prompt's tokens. */
export interface Consumption {
  readonly cost: number;
  readonly context: number;
}

/** A guard refusal: Specty's message and its next step, inside a tool's output. */
const REFUSAL = /specty: [^"]*?(?:SIGUIENTE|NEXT):/;

/** The tool calls of each agent other than Claude Code, one per matching line. */
const ROUNDS: Readonly<Record<Exclude<AgentId, "claude-code">, RegExp>> = {
  codex:
    /"type":"item\.completed","item":\{[^}]*?"type":"(?:command_execution|file_change|mcp_tool_call)"/,
  "gemini-cli": /"type":"tool_use"/,
  opencode: /"type":"tool_use"/,
  cursor: /"type":"tool_call","subtype":"started"/,
};

export function countsOf(id: AgentId, transcript: string): Counts {
  const lines = transcript.split("\n");
  if (id === "claude-code") return claudeCounts(lines);
  const pattern = ROUNDS[id];
  return {
    rounds: lines.filter((line) => pattern.test(line)).length,
    blocks: lines.filter((line) => REFUSAL.test(line)).length,
  };
}

/** Claude Code's `stream-json`: each `tool_use`, and each `tool_result` in error from the guard. */
function claudeCounts(lines: readonly string[]): Counts {
  let rounds = 0;
  let blocks = 0;
  for (const item of lines.flatMap(contentOf)) {
    if (item.type === "tool_use") rounds += 1;
    if (
      item.type === "tool_result" &&
      item.is_error === true &&
      textOf(item.content).includes("specty:")
    ) {
      blocks += 1;
    }
  }
  return { rounds, blocks };
}

/**
 * The consumption of a run of Claude Code, from its `stream-json`: the cost its result gives, its
 * subagents' included, and the largest prompt of its main thread's answers, which carry no
 * `parent_tool_use_id`. Other agents, or a run without its result, tell nothing.
 */
export function consumptionOf(id: AgentId, transcript: string): Consumption | undefined {
  if (id !== "claude-code") return undefined;
  let cost: number | undefined;
  let context = 0;
  for (const line of transcript.split("\n")) {
    const value = parsed(line);
    if (!isObject(value)) continue;
    if (value.type === "result" && typeof value.total_cost_usd === "number") {
      cost = value.total_cost_usd;
    }
    if (value.type === "assistant" && value.parent_tool_use_id == null) {
      context = Math.max(context, promptOf(value.message));
    }
  }
  return cost === undefined ? undefined : { cost, context };
}

/** The tokens an answer read: its input, cache writes and cache reads. */
function promptOf(message: unknown): number {
  const usage = isObject(message) ? message.usage : undefined;
  if (!isObject(usage)) return 0;
  return ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
    .map((key) => usage[key])
    .reduce((total: number, count) => total + (typeof count === "number" ? count : 0), 0);
}

function parsed(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

interface Item {
  readonly type?: unknown;
  readonly is_error?: unknown;
  readonly content?: unknown;
}

/** The content items of one line's message, or none for a line that is not one. */
function contentOf(line: string): Item[] {
  const value = parsed(line);
  const message = isObject(value) ? value.message : undefined;
  const content = isObject(message) ? message.content : undefined;
  return Array.isArray(content) ? content.filter(isObject) : [];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return Array.isArray(content)
    ? content
        .map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
        .join("")
    : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `binary` in a folder of the PATH, found without running anything. */
function onPath(env: NodeJS.ProcessEnv, binary: string): string | undefined {
  const folders = (env.PATH ?? "").split(delimiter).filter((folder) => folder !== "");
  return folders.map((folder) => join(folder, binary)).find((path) => existsSync(path));
}

/** The agent's binary, as `SPECTY_EVALS_<ID>` names it or on the PATH. */
function finder(id: AgentId, binary: string): (env: NodeJS.ProcessEnv) => string | undefined {
  const key = `SPECTY_EVALS_${id.toUpperCase().replaceAll("-", "_")}`;
  return (env) => env[key] || onPath(env, binary);
}

/** Editors whose Claude Code extension carries the CLI. */
const EDITORS = [".vscode", ".cursor", ".windsurf", ".antigravity-ide"];

/** The newest Claude Code an editor's extension carries. */
function bundledClaude(): string | undefined {
  const found = EDITORS.flatMap((editor) => {
    const folder = join(homedir(), editor, "extensions");
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((name) => name.startsWith("anthropic.claude-code-"))
      .map((name) => join(folder, name, "resources", "native-binary", "claude"))
      .filter((path) => existsSync(path));
  });
  return found.toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
}

export const AGENTS: readonly Agent[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    find: (env) => finder("claude-code", "claude")(env) ?? bundledClaude(),
    command: (binary, prompt, turns = 30) => [
      binary,
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-turns",
      String(turns),
      "--permission-mode",
      "acceptEdits",
      // `Agent` lets it hand work to the subagents the repository defines.
      "--allowedTools",
      "Bash,Read,Write,Edit,Glob,Grep,Agent",
    ],
  },
  {
    id: "codex",
    name: "Codex",
    find: finder("codex", "codex"),
    command: (binary, prompt) => [binary, "exec", "--json", "-s", "workspace-write", prompt],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    find: finder("gemini-cli", "gemini"),
    command: (binary, prompt) => [binary, "-p", prompt, "--output-format", "stream-json"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    find: finder("opencode", "opencode"),
    command: (binary, prompt) => [binary, "run", "--format", "json", prompt],
  },
  {
    id: "cursor",
    name: "Cursor CLI",
    find: finder("cursor", "cursor-agent"),
    command: (binary, prompt) => [binary, "-p", prompt, "--output-format", "stream-json"],
  },
];

export function agentName(id: AgentId): string {
  return AGENTS.find((agent) => agent.id === id)?.name ?? id;
}
