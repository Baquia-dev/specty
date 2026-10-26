// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool, isAgentTool } from "./agents";
import type { Lang } from "./i18n";

/**
 * Where `init` installs an agent's guard: the repository, or nowhere yet. Never the user's
 * configuration (ADR 0013).
 */
export type GuardSurface = "repository" | "none";

/** What Specty does with one agent. */
export interface AgentCapabilities {
  /** Paths whose presence in a repository says the agent is used there. */
  readonly markers: readonly string[];
  readonly guard: GuardSurface;
  /** The guard checks what each shell command changed, right after it ran. */
  readonly afterShell: boolean;
  /** The task card comes back after the conversation is compacted. */
  readonly afterCompaction: boolean;
  /** The agent enters a change's worktree by name, without a permission prompt. */
  readonly worktreeByName: boolean;
}

/**
 * What Specty does with each agent, in one place (the idea of gentle-ai's `capabilitymanifest`):
 * `init`, the guard, the detection and ARCHITECTURE §10 read it instead of keeping their own lists.
 */
export const AGENT_CAPABILITIES = {
  "claude-code": {
    markers: [".claude", "CLAUDE.md"],
    guard: "repository",
    afterShell: true,
    afterCompaction: true,
    worktreeByName: true,
  },
  cursor: {
    markers: [".cursor", ".cursorrules"],
    guard: "repository",
    afterShell: true,
    afterCompaction: false,
    worktreeByName: false,
  },
  codex: {
    markers: [".codex"],
    guard: "repository",
    afterShell: true,
    afterCompaction: false,
    worktreeByName: false,
  },
  opencode: {
    markers: [".opencode", "opencode.json", "opencode.jsonc"],
    guard: "repository",
    afterShell: true,
    afterCompaction: false,
    worktreeByName: false,
  },
  "gemini-cli": {
    markers: [".gemini", "GEMINI.md"],
    guard: "none",
    afterShell: false,
    afterCompaction: false,
    worktreeByName: false,
  },
  copilot: {
    markers: [".github/copilot-instructions.md", ".github/instructions"],
    guard: "none",
    afterShell: false,
    afterCompaction: false,
    worktreeByName: false,
  },
  windsurf: {
    markers: [".windsurf", ".windsurfrules"],
    guard: "none",
    afterShell: false,
    afterCompaction: false,
    worktreeByName: false,
  },
  antigravity: {
    markers: [".agents", ".agent"],
    guard: "none",
    afterShell: false,
    afterCompaction: false,
    worktreeByName: false,
  },
} as const satisfies Readonly<Record<AgentTool, AgentCapabilities>>;

/** The agents that have Specty's guard, derived from the table so no list can drift from it. */
export type GuardedAgent = {
  [Tool in AgentTool]: (typeof AGENT_CAPABILITIES)[Tool]["guard"] extends "none" ? never : Tool;
}[AgentTool];

export function isGuardedAgent(tool: AgentTool): tool is GuardedAgent {
  return AGENT_CAPABILITIES[tool].guard !== "none";
}

/** The table as Markdown, as ARCHITECTURE §10 shows it. */
export function capabilityTable(lang: Lang): string {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const mark = (value: boolean) => (value ? t("sí", "yes") : "—");
  const guard: Readonly<Record<GuardSurface, string>> = {
    repository: t("en el repositorio", "in the repository"),
    none: "—",
  };
  const rows = Object.keys(AGENT_NAMES)
    .filter(isAgentTool)
    .map((tool) => {
      const can: AgentCapabilities = AGENT_CAPABILITIES[tool];
      const markers = can.markers.map((marker) => `\`${marker}\``).join(", ");
      const cells = [
        AGENT_NAMES[tool],
        guard[can.guard],
        mark(can.afterShell),
        mark(can.afterCompaction),
        mark(can.worktreeByName),
        markers,
      ];
      return `| ${cells.join(" | ")} |`;
    });
  return [
    t(
      "| Herramienta | Guard | Aviso tras cada comando | Tarjeta tras compactar | Worktree por nombre | Se detecta por |",
      "| Tool | Guard | Warning after each command | Card after compaction | Worktree by name | Detected by |",
    ),
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
