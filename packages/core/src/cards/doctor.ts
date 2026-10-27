// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
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
  | { readonly code: "delegated"; readonly since: string; readonly by: string };

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
  "claude-guard": (_, t) => t("Claude Code: guard instalado.", "Claude Code: guard installed."),
  "no-claude-guard": (_, t, command) =>
    t(
      `Claude Code: falta el guard; ejecuta \`${command} init\`.`,
      `Claude Code: the guard is missing; run \`${command} init\`.`,
    ),
  "claude-after-bash": (line, t, command) =>
    t(
      `Claude Code: falta la comprobación tras cada comando de Bash (${line.events}); ejecuta \`${command} init\`.`,
      `Claude Code: the check after each Bash command is missing (${line.events}); run \`${command} init\`.`,
    ),
  "claude-worktrees": (line, t, command) =>
    t(
      `Claude Code: faltan los hooks de las worktrees (${line.events}), así que \`EnterWorktree\` por nombre no entra en la carpeta del cambio; ejecuta \`${command} init\`.`,
      `Claude Code: the worktree hooks are missing (${line.events}), so \`EnterWorktree\` by name does not enter the change's folder; run \`${command} init\`.`,
    ),
  "claude-compact": (line, t, command) =>
    t(
      `Claude Code: falta la tarjeta de Specty tras compactar (${line.events}); ejecuta \`${command} init\`.`,
      `Claude Code: Specty's card after a compaction is missing (${line.events}); run \`${command} init\`.`,
    ),
  "no-claude-permissions": (_, t, command) =>
    t(
      `Claude Code: faltan los permisos de los comandos de la persona, así que su modo auto puede vetárselos al agente aunque Specty se los permita; ejecuta \`${command} init\`.`,
      `Claude Code: the permissions for the person's commands are missing, so its auto mode may veto them for the agent even when Specty allows them; run \`${command} init\`.`,
    ),
  "cursor-guard": (_, t) => t("Cursor: guard instalado.", "Cursor: guard installed."),
  "no-cursor-guard": (_, t, command) =>
    t(
      `Cursor: falta el guard; ejecuta \`${command} init --tools cursor\`.`,
      `Cursor: the guard is missing; run \`${command} init --tools cursor\`.`,
    ),
  "cursor-compact": (_, t, command) =>
    t(
      `Cursor: falta la tarjeta de Specty tras compactar (preCompact); ejecuta \`${command} init --tools cursor\`.`,
      `Cursor: Specty's card after a compaction is missing (preCompact); run \`${command} init --tools cursor\`.`,
    ),
  "cursor-sandbox": (line, t) =>
    t(
      `Cursor: su sandbox deja escribir a Specty en la carpeta de git y en la de las worktrees (${line.file}).`,
      `Cursor: its sandbox lets Specty write in the git folder and the worktrees' folder (${line.file}).`,
    ),
  "no-cursor-sandbox": (_, t, command) =>
    t(
      `Cursor: su sandbox no deja escribir a Specty en la carpeta de git de las worktrees, así que fallan sus commits; ejecuta \`${command} init --tools cursor\`.`,
      `Cursor: its sandbox does not let Specty write in the worktrees' git folder, so its commits fail; run \`${command} init --tools cursor\`.`,
    ),
  "cursor-after-command": (line, t, command) =>
    t(
      `Cursor: falta la comprobación tras cada comando (${line.events}); ejecuta \`${command} init --tools cursor\`.`,
      `Cursor: the check after each command is missing (${line.events}); run \`${command} init --tools cursor\`.`,
    ),
  "codex-guard": (line, t) =>
    t(
      `Codex: guard en ${line.file}; Codex lo ejecuta cuando confías en él con \`/hooks\`.`,
      `Codex: guard in ${line.file}; Codex runs it once you trust it with \`/hooks\`.`,
    ),
  "no-codex-guard": (line, t, command) =>
    t(
      `Codex: falta el guard en ${line.file}; ejecuta \`${command} init --tools codex\`.`,
      `Codex: the guard is missing in ${line.file}; run \`${command} init --tools codex\`.`,
    ),
  "codex-compact": (line, t, command) =>
    t(
      `Codex: falta la tarjeta de Specty tras compactar (SessionStart en ${line.file}); ejecuta \`${command} init --tools codex\`.`,
      `Codex: Specty's card after a compaction is missing (SessionStart in ${line.file}); run \`${command} init --tools codex\`.`,
    ),
  "codex-rules": (line, t) =>
    t(`Codex: regla de Specty en ${line.file}.`, `Codex: Specty's rule in ${line.file}.`),
  "no-codex-rules": (line, t, command) =>
    t(
      `Codex: falta la regla de Specty en ${line.file}, así que cada commit de Specty pide permiso; ejecuta \`${command} init --tools codex\`.`,
      `Codex: Specty's rule is missing in ${line.file}, so each of Specty's commits asks for permission; run \`${command} init --tools codex\`.`,
    ),
  "opencode-guard": (line, t) =>
    t(`OpenCode: plugin del guard en ${line.file}.`, `OpenCode: guard plugin in ${line.file}.`),
  "opencode-after-command": (_, t, command) =>
    t(
      `OpenCode: al plugin del guard le falta la comprobación tras cada comando; ejecuta \`${command} init --tools opencode\`.`,
      `OpenCode: the guard plugin lacks the check after each command; run \`${command} init --tools opencode\`.`,
    ),
  "antigravity-guard": (line, t) =>
    t(
      `Antigravity: guard en ${line.file}; Antigravity lo ejecuta cuando confías en la carpeta.`,
      `Antigravity: guard in ${line.file}; Antigravity runs it once you trust the folder.`,
    ),
  "no-antigravity-guard": (line, t, command) =>
    t(
      `Antigravity: falta el guard en ${line.file}; ejecuta \`${command} init --tools antigravity\`.`,
      `Antigravity: the guard is missing in ${line.file}; run \`${command} init --tools antigravity\`.`,
    ),
  "antigravity-hooks": (line, t, command) =>
    t(
      `Antigravity: faltan hooks de Specty en ${line.file} (${line.events}); ejecuta \`${command} init --tools antigravity\`.`,
      `Antigravity: Specty's hooks are missing in ${line.file} (${line.events}); run \`${command} init --tools antigravity\`.`,
    ),
  "windsurf-guard": (line, t) =>
    t(
      `Devin (Windsurf): guard en ${line.file}; Devin Desktop no lo ejecuta en modo restringido.`,
      `Devin (Windsurf): guard in ${line.file}; Devin Desktop does not run it in restricted mode.`,
    ),
  "no-windsurf-guard": (line, t, command) =>
    t(
      `Devin (Windsurf): falta el guard en ${line.file}; ejecuta \`${command} init --tools windsurf\`.`,
      `Devin (Windsurf): the guard is missing in ${line.file}; run \`${command} init --tools windsurf\`.`,
    ),
  "windsurf-hooks": (line, t, command) =>
    t(
      `Devin (Windsurf): faltan hooks de Specty en ${line.file} (${line.events}); ejecuta \`${command} init --tools windsurf\`.`,
      `Devin (Windsurf): Specty's hooks are missing in ${line.file} (${line.events}); run \`${command} init --tools windsurf\`.`,
    ),
  "gemini-guard": (line, t) =>
    t(
      `Gemini CLI: guard en ${line.file}; Gemini CLI avisa antes de ejecutarlo si es nuevo o cambió.`,
      `Gemini CLI: guard in ${line.file}; Gemini CLI asks before running it when it is new or changed.`,
    ),
  "no-gemini-guard": (line, t, command) =>
    t(
      `Gemini CLI: falta el guard en ${line.file}; ejecuta \`${command} init --tools gemini-cli\`.`,
      `Gemini CLI: the guard is missing in ${line.file}; run \`${command} init --tools gemini-cli\`.`,
    ),
  "gemini-hooks": (line, t, command) =>
    t(
      `Gemini CLI: faltan hooks de Specty en ${line.file} (${line.events}); ejecuta \`${command} init --tools gemini-cli\`.`,
      `Gemini CLI: Specty's hooks are missing in ${line.file} (${line.events}); run \`${command} init --tools gemini-cli\`.`,
    ),
  "opencode-compact": (_, t, command) =>
    t(
      `OpenCode: al plugin del guard le falta la tarjeta de Specty tras compactar; ejecuta \`${command} init --tools opencode\`.`,
      `OpenCode: the guard plugin lacks Specty's card after a compaction; run \`${command} init --tools opencode\`.`,
    ),
  "no-opencode-guard": (line, t, command) =>
    t(
      `OpenCode: falta el plugin del guard en ${line.file}; ejecuta \`${command} init --tools opencode\`.`,
      `OpenCode: the guard plugin is missing in ${line.file}; run \`${command} init --tools opencode\`.`,
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
  delegated: (line, t, command) =>
    t(
      `Modo delegado activo desde el ${line.since} (${line.by}): tu agente toma tus decisiones. Para desactivarlo: \`${command} delegate off\`.`,
      `Delegated mode on since ${line.since} (${line.by}): your agent makes your decisions. To turn it off: \`${command} delegate off\`.`,
    ),
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
