// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { Session } from "./launch";

/**
 * The agents of the suite: how to find each one, its command line without an interface, and how
 * to count its tool calls (rounds) and the guard's refusals (blocks) in its transcript. Claude
 * Code's and Antigravity CLI's counts are exact; the others' is by pattern, since their formats
 * change between versions. No command line takes the options that skip an agent's sandbox or its
 * permissions.
 */

export type AgentId =
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "opencode"
  | "cursor"
  | "antigravity";

export interface Agent {
  readonly id: AgentId;
  readonly name: string;
  /** Its binary: `SPECTY_EVALS_<ID>`, on the PATH or, for Claude Code, in an editor's extension. */
  find(env: NodeJS.ProcessEnv): string | undefined;
  /**
   * The command line that runs `prompt` without an interface, in `folder`, the repository it
   * starts in, with `turns` of the model at most where the agent takes a limit (30 by default).
   * Only Antigravity CLI uses the folder: it trusts it for the session.
   */
  command(binary: string, prompt: string, turns?: number, folder?: string): string[];
  /**
   * The same run with its conversation kept open, for a person who decides while it runs
   * (ARCHITECTURE §16): its command line, without the prompt, and its session, which brings the
   * prompt. Only Claude Code has one.
   */
  conversation?(binary: string, prompt: string, turns?: number): Conversation;
}

interface Conversation {
  readonly command: string[];
  readonly session: Session;
}

/**
 * What the suite runs: with a person who decides, the agent's conversation, if it has one;
 * otherwise its command line, with the prompt and its input closed.
 */
export function invocation(
  agent: Agent,
  binary: string,
  prompt: string,
  options: {
    readonly turns: number | undefined;
    readonly person: boolean;
    readonly folder?: string;
  },
): { readonly command: string[]; readonly session?: Session } {
  const open = options.person ? agent.conversation?.(binary, prompt, options.turns) : undefined;
  return open ?? { command: agent.command(binary, prompt, options.turns, options.folder) };
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

/** The tool calls of each agent counted by pattern, one per matching line. */
const ROUNDS: Readonly<Record<Exclude<AgentId, "claude-code" | "antigravity">, RegExp>> = {
  codex:
    /"type":"item\.completed","item":\{[^}]*?"type":"(?:command_execution|file_change|mcp_tool_call)"/,
  "gemini-cli": /"type":"tool_use"/,
  opencode: /"type":"tool_use"/,
  cursor: /"type":"tool_call","subtype":"started"/,
};

export function countsOf(id: AgentId, transcript: string): Counts {
  const lines = transcript.split("\n");
  if (id === "claude-code") return claudeCounts(lines);
  if (id === "antigravity") return agyCounts(lines);
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
 * Antigravity CLI's `stream-json`: each tool step (a `step_update` with `step_type: "tool"`), once
 * by its conversation and index, though it comes when it starts and again when it ends; and those
 * that end in `ERROR` with the guard's refusal, which agy gives as «tool call denied by pre-tool
 * hook: specty: …». Its final answer may quote the refusal, which is no step.
 */
function agyCounts(lines: readonly string[]): Counts {
  const rounds = new Set<string>();
  const blocks = new Set<string>();
  for (const line of lines) {
    const value = parsed(line);
    const step = isObject(value) ? value.step_update : undefined;
    if (!isObject(step) || step.step_type !== "tool") continue;
    const key = `${String(step.conversation_id)}:${String(step.step_index)}`;
    rounds.add(key);
    const info = isObject(step.tool_info) ? step.tool_info : {};
    const error = isObject(info.error) ? info.error : {};
    if (step.state === "ERROR" && textOf(error.message).includes("specty:")) blocks.add(key);
  }
  return { rounds: rounds.size, blocks: blocks.size };
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

/**
 * The final answer of a run of Claude Code: the text of its `stream-json`'s result. Other agents,
 * or a run without its result, tell nothing.
 */
export function answerOf(id: AgentId, transcript: string): string | undefined {
  if (id !== "claude-code") return undefined;
  return transcript
    .split("\n")
    .map(parsed)
    .filter(isObject)
    .flatMap((value) =>
      value.type === "result" && typeof value.result === "string" ? [value.result] : [],
    )
    .at(-1);
}

/**
 * The shell commands of Claude Code's subagents: the `Bash` calls of the answers that carry a
 * `parent_tool_use_id`, without its main thread's. Other agents tell none.
 */
export function subagentCommandsOf(id: AgentId, transcript: string): string[] {
  if (id !== "claude-code") return [];
  return transcript.split("\n").flatMap((line) => {
    const value = parsed(line);
    if (!isObject(value) || value.type !== "assistant" || value.parent_tool_use_id == null) {
      return [];
    }
    return contentOf(line).flatMap((item) =>
      item.type === "tool_use" &&
      item.name === "Bash" &&
      isObject(item.input) &&
      typeof item.input.command === "string"
        ? [item.input.command]
        : [],
    );
  });
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
  readonly name?: unknown;
  readonly input?: unknown;
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

/** Claude Code's options after its prompt: its `stream-json`, its turns and its permissions. */
function claudeOptions(turns: number): string[] {
  return [
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
  ];
}

/**
 * Claude Code's session over `stream-json`: the prompt as the user's message, and done once its
 * main thread answers (a `result`) with no background task left, by the last list that
 * `background_tasks_changed` gave. A task that ends wakes whoever launched it, and the main thread
 * answers again; an empty list without a result is a subagent about to resume.
 */
function claudeSession(prompt: string): Session {
  const message = { type: "user", message: { role: "user", content: prompt } };
  let tasks = 0;
  return {
    input: `${JSON.stringify({ ...message, parent_tool_use_id: null, session_id: "" })}\n`,
    done(line) {
      const value = parsed(line);
      if (!isObject(value)) return false;
      if (value.subtype === "background_tasks_changed" && Array.isArray(value.tasks)) {
        tasks = value.tasks.length;
      }
      return value.type === "result" && tasks === 0;
    },
  };
}

/**
 * Antigravity CLI's settings for the session, which agy never saves. Nobody answers in print mode,
 * so its commands run in its terminal sandbox without asking and those that would leave it are
 * denied, as in Codex's `workspace-write`; Specty's leave it when the model asks to, with the rule
 * `init` gives the person (`command(specty)`). And the repository is trusted: agy only loads its
 * `.agents/hooks.json`, the guard, from a trusted folder.
 */
function agySettings(folder: string | undefined): string {
  return JSON.stringify({
    toolPermission: "proceed-in-sandbox",
    permissions: { allow: ["command(specty)"] },
    ...(folder === undefined ? {} : { trustedWorkspaces: [folder] }),
  });
}

export const AGENTS: readonly Agent[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    find: (env) => finder("claude-code", "claude")(env) ?? bundledClaude(),
    command: (binary, prompt, turns = 30) => [binary, "-p", prompt, ...claudeOptions(turns)],
    conversation: (binary, prompt, turns = 30) => ({
      command: [binary, "-p", "--input-format", "stream-json", ...claudeOptions(turns)],
      session: claudeSession(prompt),
    }),
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
  {
    id: "antigravity",
    name: "Antigravity CLI",
    find: finder("antigravity", "agy"),
    command: (binary, prompt, _turns, folder) => [
      ...[binary, "-p", prompt, "--mode", "accept-edits", "--sandbox"],
      ...["--output-format", "stream-json", "--settings", agySettings(folder)],
    ],
  },
];

export function agentName(id: AgentId): string {
  return AGENTS.find((agent) => agent.id === id)?.name ?? id;
}
