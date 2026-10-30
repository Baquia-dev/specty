// SPDX-License-Identifier: Apache-2.0
import type { AgentTool } from "../agents";
import { headerOf, type Output, section } from "../output";
import { AGENT_WRITERS } from "./doctor-agents";
import { MCP_WRITERS } from "./mcp";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty doctor`: one line per check, good or bad, and its card.

/** What one check of `specty doctor` found. */
export type DoctorLine =
  | { readonly code: "config-valid" }
  | { readonly code: "flow-block" | "no-flow-block" }
  | { readonly code: "git-hooks" | "no-git-hooks" }
  | { readonly code: "claude-guard" | "no-claude-guard" }
  /** Claude Code's guard is there, without the hooks of these events. */
  | {
      readonly code: "claude-after-bash" | "claude-worktrees" | "claude-compact";
      readonly events: string;
    }
  /** Claude Code's settings lack the permission for the person's commands. */
  | { readonly code: "no-claude-permissions" }
  | { readonly code: "cursor-guard" | "no-cursor-guard" }
  /** Cursor's guard is there, without `preCompact`, which leaves the card for the next command. */
  | { readonly code: "cursor-compact" }
  /** Whether Cursor's sandbox lets Specty write in git's folder and the worktrees' (`file`). */
  | { readonly code: "cursor-sandbox" | "no-cursor-sandbox"; readonly file: string }
  | { readonly code: "cursor-after-command"; readonly events: string }
  /** Codex's guard, its rule for Specty's commands and OpenCode's plugin, in the project: `file`. */
  | { readonly code: "codex-guard" | "no-codex-guard"; readonly file: string }
  /** Codex's guard is there, without the hook that brings the card back after a compaction. */
  | { readonly code: "codex-compact"; readonly file: string }
  | { readonly code: "codex-rules" | "no-codex-rules"; readonly file: string }
  | {
      readonly code: "opencode-guard" | "opencode-after-command" | "no-opencode-guard";
      readonly file: string;
    }
  /** OpenCode's plugin is there, without the card after a compaction. */
  | { readonly code: "opencode-compact" }
  /** Antigravity's guard in `file`, its hook named `specty`. */
  | { readonly code: "antigravity-guard" | "no-antigravity-guard"; readonly file: string }
  /** Antigravity's guard is there, without the hooks of these events. */
  | { readonly code: "antigravity-hooks"; readonly file: string; readonly events: string }
  /** Devin's guard in `file`, its standalone hooks. */
  | { readonly code: "windsurf-guard" | "no-windsurf-guard"; readonly file: string }
  /** Devin's guard is there, without the hooks of these events. */
  | { readonly code: "windsurf-hooks"; readonly file: string; readonly events: string }
  /** Gemini CLI's guard in `file`, its project settings. */
  | { readonly code: "gemini-guard" | "no-gemini-guard"; readonly file: string }
  /** Gemini CLI's guard is there, without the hooks of these events. */
  | { readonly code: "gemini-hooks"; readonly file: string; readonly events: string }
  /**
   * An agent's `file` as `init` wrote it before `specty enter`: the agent does not carry the
   * actions of a conversation that entered a change's folder there, or fails in it.
   */
  | { readonly code: "enter-outdated"; readonly tool: AgentTool; readonly file: string }
  /** gentle-ai's flow guidance, which asks the agent for what the guard blocks. */
  | { readonly code: "gentle-ai"; readonly file: string; readonly blocks: readonly string[] }
  | { readonly code: "formatter-excludes"; readonly name: string; readonly path: string }
  | {
      readonly code: "formatter-checks";
      readonly name: string;
      readonly path: string;
      readonly add: string;
      readonly file: string;
    }
  | { readonly code: "specty-reachable"; readonly command: string }
  | { readonly code: "specty-unreachable" }
  | { readonly code: "verify-default"; readonly command: string }
  | { readonly code: "no-verify-default" }
  | { readonly code: "node" | "old-node"; readonly version: string }
  /** Paths AGENTS.md cites that do not exist, and are not built either. */
  | { readonly code: "missing-paths"; readonly paths: readonly string[] }
  /** Sections of AGENTS.md only the person can fill in, still empty. */
  | { readonly code: "unfilled-sections"; readonly sections: readonly string[] }
  /** The glossary exists and defines no term yet: only its hints. */
  | { readonly code: "empty-glossary"; readonly path: string }
  /** Closing would not find ccusage to measure each change; `command` installs it. */
  | { readonly code: "no-ccusage"; readonly command: string }
  | { readonly code: "delegated"; readonly since: string; readonly by: string }
  /** Specty's MCP server in an agent's project configuration (`cards/mcp.ts`). */
  | {
      readonly code: "mcp-registered" | "mcp-missing" | "mcp-other";
      readonly tool: AgentTool;
      readonly file: string;
    }
  | { readonly code: "mcp-user-folder"; readonly tool: AgentTool };

type Code = DoctorLine["code"];
/** Each line, by its code. */
type LineMap = { readonly [C in Code]: DoctorLine & { readonly code: C } };

/**
 * What `doctor` says for each line, by its code: one small function per line, so adding a check
 * adds an entry and no branch grows.
 */
const WRITERS: {
  readonly [C in Code]: (line: LineMap[C], t: Translate, command: string) => string;
} = {
  "config-valid": (_, t) => t(".specty/config.yaml es válido.", ".specty/config.yaml is valid."),
  "flow-block": (_, t) => t("AGENTS.md tiene el bloque de flujo.", "AGENTS.md has the flow block."),
  "no-flow-block": (_, t, command) =>
    t(
      `AGENTS.md no tiene el bloque de flujo: ejecuta \`${command} init\`.`,
      `AGENTS.md lacks the flow block: run \`${command} init\`.`,
    ),
  "git-hooks": (_, t) => t("Hooks de git instalados.", "Git hooks installed."),
  "no-git-hooks": (_, t, command) =>
    t(
      `Faltan los hooks de git: ejecuta \`${command} init\`.`,
      `Git hooks are missing: run \`${command} init\`.`,
    ),
  "gentle-ai": (line, t) => {
    const names = line.blocks.map((block) => `\`${block}\``).join(", ");
    return t(
      `gentle-ai: ${line.file} tiene su guía de flujo (${names}), que pide al agente sus propios commits y su propio plan; el guard de Specty bloquea esos commits. Quita esos bloques de ${line.file} para trabajar con Specty.`,
      `gentle-ai: ${line.file} has its flow guidance (${names}), which asks the agent for its own commits and plan; Specty's guard blocks those commits. Remove those blocks from ${line.file} to work with Specty.`,
    );
  },
  "formatter-excludes": (line, t) =>
    t(`${line.name} excluye ${line.path}.`, `${line.name} excludes ${line.path}.`),
  "formatter-checks": (line, t) =>
    t(
      `${line.name} también revisa ${line.path}, que escribe Specty: añade ${line.add} en ${line.file}.`,
      `${line.name} also checks ${line.path}, which Specty writes: add ${line.add} to ${line.file}.`,
    ),
  "specty-reachable": (line, t) =>
    t(
      `Los hooks pueden ejecutar Specty (${line.command}).`,
      `Hooks can run Specty (${line.command}).`,
    ),
  "specty-unreachable": (_, t) =>
    t(
      "Los hooks no encuentran Specty: instálalo con `npm i -g @baquia-dev/specty`.",
      "Hooks cannot find Specty: install it with `npm i -g @baquia-dev/specty`.",
    ),
  "verify-default": (line, t) =>
    t(
      `Verificación por defecto: \`${line.command}\`.`,
      `Default verification: \`${line.command}\`.`,
    ),
  "no-verify-default": (_, t) =>
    t(
      "Falta verify.default en .specty/config.yaml.",
      "verify.default is missing in .specty/config.yaml.",
    ),
  node: (line, t) => t(`Node ${line.version}.`, `Node ${line.version}.`),
  "old-node": (line, t) =>
    t(
      `Node ${line.version}: Specty necesita Node 22 o posterior.`,
      `Node ${line.version}: Specty needs Node 22 or later.`,
    ),
  "missing-paths": (line, t) => {
    const paths = line.paths.map((path) => `\`${path}\``).join(", ");
    return t(
      `AGENTS.md cita rutas que no existen: ${paths}. Corrígelas o quítalas: el agente lee AGENTS.md en cada sesión.`,
      `AGENTS.md cites paths that do not exist: ${paths}. Fix or remove them: the agent reads AGENTS.md every session.`,
    );
  },
  "unfilled-sections": (line, t) => {
    const listed = (open: string, close: string, and: string) =>
      line.sections.map((title) => `${open}${title}${close}`).join(` ${and} `);
    return t(
      `AGENTS.md tiene sin completar ${listed("«", "»", "y")}: el agente lo lee en cada sesión, así que escribe ahí lo que el código no dice (los directorios cuyo propósito no es obvio, lo que no se toca, las reglas que no verifica \`specty check\`).`,
      `AGENTS.md has ${listed('"', '"', "and")} not filled in: the agent reads it every session, so write there what the code does not say (directories whose purpose is not obvious, what must not be touched, rules \`specty check\` does not verify).`,
    );
  },
  "empty-glossary": (line, t) =>
    t(
      `El glosario (\`${line.path}\`) no define ningún término: añade una línea por término con la forma «- **Término** (\`NombreEnElCódigo\`): definición.», y las tarjetas traerán las definiciones de los que usen.`,
      `The glossary (\`${line.path}\`) defines no term: add one line per term shaped "- **Term** (\`CodeName\`): definition.", and the cards will bring the definitions of the ones they use.`,
    ),
  "no-ccusage": (line, t) =>
    t(
      `Falta ccusage, así que al cerrar cada cambio Specty no dice lo que consumió. Para instalarlo: \`${line.command}\`.`,
      `ccusage is missing, so closing a change does not say what it consumed. To install it: \`${line.command}\`.`,
    ),
  delegated: (line, t, command) =>
    t(
      `Modo delegado activo desde el ${line.since} (${line.by}): tu agente toma tus decisiones. Para desactivarlo: \`${command} delegate off\`.`,
      `Delegated mode on since ${line.since} (${line.by}): your agent makes your decisions. To turn it off: \`${command} delegate off\`.`,
    ),
  ...AGENT_WRITERS,
  ...MCP_WRITERS,
};

export function doctorLine(line: DoctorLine, ctx: CardContext): string {
  return write(line.code, line, ctx);
}

/** The line through the writer of its code, which the type ties to that line. */
function write<C extends Code>(code: C, line: LineMap[C], ctx: CardContext): string {
  return WRITERS[code](line, translator(ctx.lang), ctx.command);
}

/** `specty doctor`: what is in place, what to look at, and what to fix; problems make it red. */
export function doctorCard(
  found: {
    readonly ok: readonly DoctorLine[];
    readonly warnings: readonly DoctorLine[];
    readonly problems: readonly DoctorLine[];
  },
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const lines = (entries: readonly DoctorLine[]) => entries.map((line) => doctorLine(line, ctx));
  return {
    status: found.problems.length === 0 ? "ok" : "invalid",
    header: headerOf("doctor"),
    blocks: [
      ...section("OK", lines(found.ok)),
      ...section(t("AVISOS", "WARNINGS"), lines(found.warnings)),
      ...section(t("PROBLEMAS", "PROBLEMS"), lines(found.problems)),
    ],
    next:
      found.problems.length === 0
        ? t(
            `todo listo; el agente empieza con \`${ctx.command} next\`.`,
            `all set; the agent starts with \`${ctx.command} next\`.`,
          )
        : t(
            "corrige los problemas y vuelve a ejecutar `specty doctor`.",
            "fix the problems and run `specty doctor` again.",
          ),
  };
}
