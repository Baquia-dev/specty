// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool, isAgentTool } from "./agents";
import type { Lang } from "./i18n";

type Texts = Readonly<Record<Lang, string>>;

/**
 * How Specty offers a capability with one agent: as Claude Code does, through another event of
 * the tool (a little later), not at all because the tool has nothing to use, still to do in the
 * epic «Todos los agentes al nivel de Claude Code», or not for this agent.
 */
export type Support =
  | { readonly state: "yes" }
  | { readonly state: "indirect"; readonly how: Texts }
  | { readonly state: "impossible"; readonly why: Texts }
  | { readonly state: "pending" }
  | { readonly state: "unsupported" };

/** What Specty does with one agent. */
export interface AgentCapabilities {
  /** Paths whose presence in a repository says the agent is used there. */
  readonly markers: readonly string[];
  /** The guard before each action, always in the repository, never in the user's folder (ADR 0013). */
  readonly guard: Support;
  /** The guard checks what each shell command changed, right after it ran. */
  readonly afterShell: Support;
  /** The task card comes back after the conversation is compacted. */
  readonly afterCompaction: Support;
  /** The agent enters a change's worktree by name, without a permission prompt. */
  readonly worktreeByName: Support;
  /** When the turn ends with `specty check --changed` failing, the agent goes on with the report. */
  readonly endOfTurn: Support;
  /** The agent does not read dependencies, builds or generated code (`check --install`). */
  readonly exclusion: Support;
  /** The tool's own permissions leave Specty's commands to Specty. */
  readonly permissions: Support;
  /** A test runs the tool itself against a scripted model. */
  readonly endToEnd: Support;
}

const yes = { state: "yes" } as const;
const pending = { state: "pending" } as const;
const unsupported = { state: "unsupported" } as const;
const impossible = (es: string, en: string) => ({ state: "impossible", why: { es, en } }) as const;

const NO_ENTER_WORKTREE = impossible(
  "solo Claude Code tiene una herramienta para cambiar de carpeta en mitad de la sesión (`EnterWorktree`); con las demás se abre otro agente en la carpeta del cambio.",
  "only Claude Code has a tool to change folders mid-session (`EnterWorktree`); with the others, another agent opens in the change's folder.",
);
const OWN_SERVER = impossible(
  "su modelo va siempre por el servidor de la herramienta, así que no se puede simular.",
  "its model always goes through the tool's own server, so it cannot be scripted.",
);

/**
 * What Specty does with each agent, in one place (the idea of gentle-ai's `capabilitymanifest`):
 * `init`, the guard, the detection and ARCHITECTURE §10 read it instead of keeping their own lists.
 */
export const AGENT_CAPABILITIES = {
  "claude-code": {
    markers: [".claude", "CLAUDE.md"],
    guard: yes,
    afterShell: yes,
    afterCompaction: yes,
    worktreeByName: yes,
    endOfTurn: yes,
    exclusion: yes,
    permissions: yes,
    endToEnd: yes,
  },
  cursor: {
    markers: [".cursor", ".cursorrules"],
    guard: yes,
    afterShell: yes,
    afterCompaction: pending,
    worktreeByName: NO_ENTER_WORKTREE,
    endOfTurn: yes,
    exclusion: yes,
    permissions: pending,
    endToEnd: OWN_SERVER,
  },
  codex: {
    markers: [".codex"],
    guard: yes,
    afterShell: yes,
    afterCompaction: yes,
    worktreeByName: NO_ENTER_WORKTREE,
    endOfTurn: yes,
    exclusion: impossible(
      "lee los archivos por la shell y no tiene un archivo de exclusión.",
      "it reads files through the shell and has no exclusion file.",
    ),
    permissions: yes,
    endToEnd: pending,
  },
  opencode: {
    markers: [".opencode", "opencode.json", "opencode.jsonc"],
    guard: yes,
    afterShell: yes,
    afterCompaction: pending,
    worktreeByName: NO_ENTER_WORKTREE,
    endOfTurn: pending,
    exclusion: pending,
    // It has no sandbox nor classifier: its permissions are the person's rules.
    permissions: yes,
    endToEnd: pending,
  },
  "gemini-cli": {
    markers: [".gemini", "GEMINI.md"],
    guard: pending,
    afterShell: pending,
    afterCompaction: pending,
    worktreeByName: NO_ENTER_WORKTREE,
    endOfTurn: pending,
    exclusion: yes,
    permissions: pending,
    endToEnd: pending,
  },
  copilot: {
    markers: [".github/copilot-instructions.md", ".github/instructions"],
    guard: unsupported,
    afterShell: unsupported,
    afterCompaction: unsupported,
    worktreeByName: unsupported,
    endOfTurn: unsupported,
    exclusion: unsupported,
    permissions: unsupported,
    endToEnd: unsupported,
  },
  windsurf: {
    markers: [".windsurf", ".windsurfrules"],
    guard: pending,
    afterShell: pending,
    afterCompaction: impossible(
      "no tiene eventos de sesión ni de compactación.",
      "it has no session or compaction events.",
    ),
    worktreeByName: NO_ENTER_WORKTREE,
    endOfTurn: impossible(
      "sus hooks posteriores no responden al modelo ni lo hacen seguir.",
      "its post hooks neither reach the model nor make it go on.",
    ),
    exclusion: yes,
    permissions: pending,
    endToEnd: impossible("no tiene CLI.", "it has no CLI."),
  },
  antigravity: {
    markers: [".agents", ".agent"],
    guard: pending,
    afterShell: pending,
    afterCompaction: pending,
    worktreeByName: NO_ENTER_WORKTREE,
    endOfTurn: pending,
    exclusion: pending,
    permissions: pending,
    endToEnd: OWN_SERVER,
  },
} as const satisfies Readonly<Record<AgentTool, AgentCapabilities>>;

/** The agents that have Specty's guard, derived from the table so no list can drift from it. */
export type GuardedAgent = {
  [Tool in AgentTool]: (typeof AGENT_CAPABILITIES)[Tool]["guard"]["state"] extends "yes"
    ? Tool
    : never;
}[AgentTool];

export function isGuardedAgent(tool: AgentTool): tool is GuardedAgent {
  return AGENT_CAPABILITIES[tool].guard.state === "yes";
}

type Capability = Exclude<keyof AgentCapabilities, "markers">;

/** The table's columns, in order, with their headings. */
const COLUMNS: readonly (readonly [Capability, Texts])[] = [
  ["guard", { es: "Guard", en: "Guard" }],
  ["afterShell", { es: "Aviso tras cada comando", en: "Warning after each command" }],
  ["afterCompaction", { es: "Tarjeta tras compactar", en: "Card after compaction" }],
  ["worktreeByName", { es: "Worktree por nombre", en: "Worktree by name" }],
  ["endOfTurn", { es: "Fin de turno", en: "End of turn" }],
  ["exclusion", { es: "Exclusión", en: "Exclusion" }],
  ["permissions", { es: "Permisos", en: "Permissions" }],
  ["endToEnd", { es: "Prueba de extremo a extremo", en: "End-to-end test" }],
];

const STATES: Readonly<Record<Support["state"], Texts>> = {
  yes: { es: "sí", en: "yes" },
  indirect: { es: "indirecto", en: "indirect" },
  impossible: { es: "no posible", en: "not possible" },
  pending: { es: "pendiente", en: "pending" },
  unsupported: { es: "—", en: "—" },
};

/**
 * The table as Markdown, as ARCHITECTURE §10 shows it: a state per agent and capability, and below
 * it how each indirect capability works and why each one is not possible, a line per reason.
 */
export function capabilityTable(lang: Lang): string {
  const tools = Object.keys(AGENT_NAMES).filter(isAgentTool);
  const heading = [
    lang === "es" ? "Herramienta" : "Tool",
    ...COLUMNS.map(([, title]) => title[lang]),
    lang === "es" ? "Se detecta por" : "Detected by",
  ];
  const rows = tools.map((tool) => {
    const can: AgentCapabilities = AGENT_CAPABILITIES[tool];
    const markers = can.markers.map((marker) => `\`${marker}\``).join(", ");
    const cells = [AGENT_NAMES[tool], ...COLUMNS.map(([key]) => STATES[can[key].state][lang])];
    return `| ${[...cells, markers].join(" | ")} |`;
  });
  const table = [
    `| ${heading.join(" | ")} |`,
    `| ${heading.map(() => "---").join(" | ")} |`,
    ...rows,
  ];
  const notes = [
    notesOf(tools, "indirect", lang === "es" ? "Indirecto" : "Indirect", lang),
    notesOf(tools, "impossible", lang === "es" ? "No posible" : "Not possible", lang),
  ].filter((lines) => lines.length > 0);
  return [table.join("\n"), ...notes.map((lines) => lines.join("\n"))].join("\n\n");
}

/**
 * The list below the table for one state: a line per capability and text, naming the agents it
 * applies to. Empty when no capability is in that state.
 */
function notesOf(
  tools: readonly AgentTool[],
  state: "indirect" | "impossible",
  title: string,
  lang: Lang,
): string[] {
  const lines = COLUMNS.flatMap(([key, column]) => {
    const said = new Map<string, string[]>();
    for (const tool of tools) {
      const can: AgentCapabilities = AGENT_CAPABILITIES[tool];
      const support = can[key];
      const text =
        support.state === "indirect" && state === "indirect"
          ? support.how[lang]
          : support.state === "impossible" && state === "impossible"
            ? support.why[lang]
            : undefined;
      if (text !== undefined) said.set(text, [...(said.get(text) ?? []), AGENT_NAMES[tool]]);
    }
    return [...said].map(([text, names]) => `- ${column[lang]} (${names.join(", ")}): ${text}`);
  });
  return lines.length === 0 ? [] : [`**${title}:**`, "", ...lines];
}
