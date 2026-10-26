// SPDX-License-Identifier: Apache-2.0
import type { EffortLevel } from "./sizing/effort";

export type AgentTool =
  | "claude-code"
  | "cursor"
  | "codex"
  | "opencode"
  | "gemini-cli"
  | "copilot"
  | "windsurf"
  | "antigravity";

export const AGENT_NAMES: Readonly<Record<AgentTool, string>> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  opencode: "OpenCode",
  "gemini-cli": "Gemini CLI",
  copilot: "GitHub Copilot",
  // Windsurf is Devin Desktop now, whose agent shares Devin CLI's hooks.
  windsurf: "Devin (Windsurf)",
  antigravity: "Antigravity",
};

/**
 * Names each tool uses for the neutral effort levels. Only tools whose settings are known
 * are listed; the table changes with model releases (ARCHITECTURE §11). Codex's is its
 * `model_reasoning_effort`, whose highest level is `xhigh`.
 */
const EFFORT_NAMES: Readonly<Partial<Record<AgentTool, Readonly<Record<EffortLevel, string>>>>> = {
  "claude-code": { low: "low", medium: "medium", high: "high", max: "max" },
  codex: { low: "low", medium: "medium", high: "high", max: "xhigh" },
};

export function isAgentTool(value: string | undefined): value is AgentTool {
  return value !== undefined && Object.hasOwn(AGENT_NAMES, value);
}

export function effortName(level: EffortLevel, tool: AgentTool | undefined): string | undefined {
  return tool === undefined ? undefined : EFFORT_NAMES[tool]?.[level];
}

/**
 * Best-effort detection of the agent running a command, from its environment. It is
 * metadata for trailers and recommendations, never proof (ARCHITECTURE §13): it can only
 * take permissions away (see `personAtTerminal`), never grant them.
 */
export function detectAgentTool(
  env: Readonly<Record<string, string | undefined>>,
): AgentTool | undefined {
  if (isAgentTool(env.SPECTY_AGENT)) return env.SPECTY_AGENT;
  return MARKS.find(([, marked]) => marked(env))?.[0];
}

type Env = Readonly<Record<string, string | undefined>>;

/** What each agent leaves in the environment of the commands it runs, in the order they are tried. */
const MARKS: readonly (readonly [AgentTool, (env: Env) => boolean])[] = [
  ["claude-code", (env) => env.CLAUDECODE === "1"],
  ["cursor", (env) => env.CURSOR_AGENT === "1"],
  ["gemini-cli", (env) => env.GEMINI_CLI === "1"],
  // Codex sets CODEX_SANDBOX only inside its sandbox; the other two reach every command.
  [
    "codex",
    (env) =>
      env.CODEX_SANDBOX !== undefined ||
      env.CODEX_CI !== undefined ||
      env.CODEX_THREAD_ID !== undefined,
  ],
  ["opencode", (env) => env.OPENCODE === "1"],
  // Antigravity CLI (1.3.6 or later) turns off the editors of Mercurial and Jujutsu, with git's,
  // in its commands, so that they fail instead of waiting; no person turns off both.
  ["antigravity", (env) => env.HGEDITOR === "false" && env.JJ_EDITOR === "false"],
];

/**
 * Whether a terminal belongs to the person: a real TTY whose environment does not give
 * an agent away. Some agents open pseudo-terminals and type into them (Codex's
 * `write_stdin`), so a TTY alone is not enough (ARCHITECTURE §4).
 */
export function personAtTerminal(
  tty: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return tty && detectAgentTool(env) === undefined;
}
