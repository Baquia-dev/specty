// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool, isAgentTool } from "./agents";
import type { Lang } from "./i18n";

type Texts = Readonly<Record<Lang, string>>;

/**
 * How Specty offers a capability with one agent: as Claude Code does, through another event of
 * the tool (a little later), not at all because the tool has nothing to use, or not for this
 * agent. There is no «still to do»: every capability says where it stands.
 */
export type Support =
  | { readonly state: "yes" }
  | { readonly state: "indirect"; readonly how: Texts }
  | { readonly state: "impossible"; readonly why: Texts }
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
const unsupported = { state: "unsupported" } as const;
const impossible = (es: string, en: string) => ({ state: "impossible", why: { es, en } }) as const;
const indirect = (es: string, en: string) => ({ state: "indirect", how: { es, en } }) as const;

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
    afterCompaction: indirect(
      "`preCompact` solo observa, así que la tarjeta llega con el resultado del siguiente comando de shell.",
      "`preCompact` only observes, so the card comes with the next shell command's result.",
    ),
    worktreeByName: indirect(
      "con `specty enter <id>`: el guard liga la conversación a la carpeta del cambio, pone un `cd` a ella delante de cada comando (`updated_input`) y bloquea con la ruta buena lo que escribiría o leería fuera, porque Cursor no reescribe sus archivos.",
      "with `specty enter <id>`: the guard binds the conversation to the change's folder, puts a `cd` to it before each command (`updated_input`) and blocks what it would write or read elsewhere, with the right path, since Cursor does not rewrite its files.",
    ),
    endOfTurn: yes,
    exclusion: yes,
    // `.cursor/sandbox.json` lets Specty's commits through from a change's folder.
    permissions: yes,
    endToEnd: OWN_SERVER,
  },
  codex: {
    markers: [".codex"],
    guard: yes,
    afterShell: yes,
    afterCompaction: yes,
    worktreeByName: indirect(
      "con `specty enter <id>`: el guard liga la conversación a la carpeta del cambio, pone un `cd` a ella delante de cada comando y lleva allí las rutas de cada parche (`updatedInput`).",
      "with `specty enter <id>`: the guard binds the conversation to the change's folder, puts a `cd` to it before each command and moves each patch's paths there (`updatedInput`).",
    ),
    endOfTurn: yes,
    exclusion: impossible(
      "lee los archivos por la shell y no tiene un archivo de exclusión.",
      "it reads files through the shell and has no exclusion file.",
    ),
    permissions: yes,
    // `codex-e2e.test.ts`, against a fake of OpenAI's Responses API.
    endToEnd: yes,
  },
  opencode: {
    markers: [".opencode", "opencode.json", "opencode.jsonc"],
    guard: yes,
    afterShell: yes,
    // Specty's plugin, checked with OpenCode 1.19.4: `session.compacted` and `session.idle`.
    afterCompaction: yes,
    worktreeByName: indirect(
      "con `specty enter <id>`: el guard liga la conversación a la carpeta del cambio, y el plugin de Specty lleva allí las rutas, los parches, las búsquedas y los comandos de sus herramientas.",
      "with `specty enter <id>`: the guard binds the conversation to the change's folder, and Specty's plugin moves its tools' paths, patches, searches and commands there.",
    ),
    endOfTurn: yes,
    // `permission.read` in `opencode.json`.
    exclusion: yes,
    // It has no sandbox nor classifier: its permissions are the person's rules.
    permissions: yes,
    // `opencode-e2e.test.ts`, against a fake of OpenAI's chat API.
    endToEnd: yes,
  },
  "gemini-cli": {
    markers: [".gemini", "GEMINI.md"],
    guard: yes,
    // `AfterTool` adds it to the command's result (`additionalContext`).
    afterShell: yes,
    afterCompaction: indirect(
      "dispara `PreCompress` antes de cada intento de compactar, compacte o no, así que la tarjeta llega al empezar cada turno, con su prompt (`BeforeAgent`).",
      "it fires `PreCompress` before every attempt to compact, whether it compacts or not, so the card comes at the start of each turn, with its prompt (`BeforeAgent`).",
    ),
    worktreeByName: indirect(
      "con `specty enter <id>`: el guard liga la conversación a la carpeta del cambio y lleva allí las rutas, las búsquedas y los comandos de sus herramientas (`hookSpecificOutput.tool_input`).",
      "with `specty enter <id>`: the guard binds the conversation to the change's folder and moves its tools' paths, searches and commands there (`hookSpecificOutput.tool_input`).",
    ),
    // `AfterAgent`, checked with Gemini CLI 0.65.0.
    endOfTurn: yes,
    exclusion: yes,
    // Its sandbox, off by default, takes Specty's folders in `tools.sandboxAllowedPaths`.
    permissions: yes,
    // `gemini-e2e.test.ts`, against a fake of the Gemini API.
    endToEnd: yes,
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
    markers: [".windsurf", ".windsurfrules", ".devin"],
    guard: yes,
    // `PostToolUse` adds it to the context (`additionalContext`).
    afterShell: yes,
    afterCompaction: indirect(
      "no consta que su `PostCompaction` pueda añadir contexto, así que la tarjeta llega con el resultado del siguiente comando de shell.",
      "its `PostCompaction` is not documented to add context, so the card comes with the next shell command's result.",
    ),
    worktreeByName: indirect(
      "con `specty enter <id>`: el guard liga la conversación a la carpeta del cambio y lleva allí las rutas, los parches y los comandos de sus herramientas (`updatedInput`).",
      "with `specty enter <id>`: the guard binds the conversation to the change's folder and moves its tools' paths, patches and commands there (`updatedInput`).",
    ),
    // `Stop`, as Claude Code's.
    endOfTurn: yes,
    exclusion: yes,
    // `Exec(specty)` in `.devin/config.json`, and Specty's folders as `Write(...)` for its sandbox.
    permissions: yes,
    endToEnd: OWN_SERVER,
  },
  antigravity: {
    // Its own files: Codex keeps its skills in `.agents` too.
    markers: [
      ".agents/hooks.json",
      ".agents/rules",
      ".agents/workflows",
      ".agent",
      ".antigravityignore",
    ],
    guard: yes,
    afterShell: indirect(
      "su `PostToolUse` no responde al modelo, así que el aviso llega en su siguiente llamada al modelo (`PreInvocation`).",
      "its `PostToolUse` does not reach the model, so the warning comes with its next model call (`PreInvocation`).",
    ),
    afterCompaction: indirect(
      "no avisa cuando compacta, así que la tarjeta llega al empezar cada turno, con su primera llamada al modelo (`PreInvocation`).",
      "it does not say when it compacts, so the card comes at the start of each turn, with its first model call (`PreInvocation`).",
    ),
    worktreeByName: indirect(
      "con `specty enter <id>`: el guard liga la conversación a la carpeta del cambio y bloquea con la ruta buena lo que haría o leería fuera; no reescribe sus acciones, porque su `overwrite` se descarta cuando pide permiso.",
      "with `specty enter <id>`: the guard binds the conversation to the change's folder and blocks what it would do or read elsewhere, with the right path; it does not rewrite its actions, since its `overwrite` is dropped when it asks for permission.",
    ),
    // `Stop` with `decision: "continue"`; Specty counts the turns it sends back.
    endOfTurn: yes,
    // `.antigravityignore`.
    exclusion: yes,
    // `permissionOverrides` with each shell command opens Specty's folders in its sandbox.
    permissions: yes,
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
