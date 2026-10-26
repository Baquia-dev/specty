// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
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
  | { readonly code: "cursor-after-command"; readonly events: string }
  /** Codex's guard, its rule for Specty's commands and OpenCode's plugin, in the project: `file`. */
  | { readonly code: "codex-guard" | "no-codex-guard"; readonly file: string }
  | { readonly code: "codex-rules" | "no-codex-rules"; readonly file: string }
  | {
      readonly code: "opencode-guard" | "opencode-after-command" | "no-opencode-guard";
      readonly file: string;
    }
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

export function doctorLine(line: DoctorLine, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const { command } = ctx;
  switch (line.code) {
    case "config-valid":
      return t(".specty/config.yaml es válido.", ".specty/config.yaml is valid.");
    case "flow-block":
      return t("AGENTS.md tiene el bloque de flujo.", "AGENTS.md has the flow block.");
    case "no-flow-block":
      return t(
        `AGENTS.md no tiene el bloque de flujo: ejecuta \`${command} init\`.`,
        `AGENTS.md lacks the flow block: run \`${command} init\`.`,
      );
    case "git-hooks":
      return t("Hooks de git instalados.", "Git hooks installed.");
    case "no-git-hooks":
      return t(
        `Faltan los hooks de git: ejecuta \`${command} init\`.`,
        `Git hooks are missing: run \`${command} init\`.`,
      );
    case "claude-guard":
      return t("Claude Code: guard instalado.", "Claude Code: guard installed.");
    case "no-claude-guard":
      return t(
        `Claude Code: falta el guard; ejecuta \`${command} init\`.`,
        `Claude Code: the guard is missing; run \`${command} init\`.`,
      );
    case "claude-after-bash":
      return t(
        `Claude Code: falta la comprobación tras cada comando de Bash (${line.events}); ejecuta \`${command} init\`.`,
        `Claude Code: the check after each Bash command is missing (${line.events}); run \`${command} init\`.`,
      );
    case "claude-worktrees":
      return t(
        `Claude Code: faltan los hooks de las worktrees (${line.events}), así que \`EnterWorktree\` por nombre no entra en la carpeta del cambio; ejecuta \`${command} init\`.`,
        `Claude Code: the worktree hooks are missing (${line.events}), so \`EnterWorktree\` by name does not enter the change's folder; run \`${command} init\`.`,
      );
    case "claude-compact":
      return t(
        `Claude Code: falta la tarjeta de Specty tras compactar (${line.events}); ejecuta \`${command} init\`.`,
        `Claude Code: Specty's card after a compaction is missing (${line.events}); run \`${command} init\`.`,
      );
    case "no-claude-permissions":
      return t(
        `Claude Code: faltan los permisos de los comandos de la persona, así que su modo auto puede vetárselos al agente aunque Specty se los permita; ejecuta \`${command} init\`.`,
        `Claude Code: the permissions for the person's commands are missing, so its auto mode may veto them for the agent even when Specty allows them; run \`${command} init\`.`,
      );
    case "cursor-guard":
      return t("Cursor: guard instalado.", "Cursor: guard installed.");
    case "no-cursor-guard":
      return t(
        `Cursor: falta el guard; ejecuta \`${command} init --tools cursor\`.`,
        `Cursor: the guard is missing; run \`${command} init --tools cursor\`.`,
      );
    case "cursor-after-command":
      return t(
        `Cursor: falta la comprobación tras cada comando (${line.events}); ejecuta \`${command} init --tools cursor\`.`,
        `Cursor: the check after each command is missing (${line.events}); run \`${command} init --tools cursor\`.`,
      );
    case "codex-guard":
      return t(
        `Codex: guard en ${line.file}; Codex lo ejecuta cuando confías en él con \`/hooks\`.`,
        `Codex: guard in ${line.file}; Codex runs it once you trust it with \`/hooks\`.`,
      );
    case "no-codex-guard":
      return t(
        `Codex: falta el guard en ${line.file}; ejecuta \`${command} init --tools codex\`.`,
        `Codex: the guard is missing in ${line.file}; run \`${command} init --tools codex\`.`,
      );
    case "codex-rules":
      return t(`Codex: regla de Specty en ${line.file}.`, `Codex: Specty's rule in ${line.file}.`);
    case "no-codex-rules":
      return t(
        `Codex: falta la regla de Specty en ${line.file}, así que cada commit de Specty pide permiso; ejecuta \`${command} init --tools codex\`.`,
        `Codex: Specty's rule is missing in ${line.file}, so each of Specty's commits asks for permission; run \`${command} init --tools codex\`.`,
      );
    case "opencode-guard":
      return t(
        `OpenCode: plugin del guard en ${line.file}.`,
        `OpenCode: guard plugin in ${line.file}.`,
      );
    case "opencode-after-command":
      return t(
        `OpenCode: al plugin del guard le falta la comprobación tras cada comando; ejecuta \`${command} init --tools opencode\`.`,
        `OpenCode: the guard plugin lacks the check after each command; run \`${command} init --tools opencode\`.`,
      );
    case "no-opencode-guard":
      return t(
        `OpenCode: falta el plugin del guard en ${line.file}; ejecuta \`${command} init --tools opencode\`.`,
        `OpenCode: the guard plugin is missing in ${line.file}; run \`${command} init --tools opencode\`.`,
      );
    case "gentle-ai": {
      const names = line.blocks.map((block) => `\`${block}\``).join(", ");
      return t(
        `gentle-ai: ${line.file} tiene su guía de flujo (${names}), que pide al agente sus propios commits y su propio plan; el guard de Specty bloquea esos commits. Quita esos bloques de ${line.file} para trabajar con Specty.`,
        `gentle-ai: ${line.file} has its flow guidance (${names}), which asks the agent for its own commits and plan; Specty's guard blocks those commits. Remove those blocks from ${line.file} to work with Specty.`,
      );
    }
    case "formatter-excludes":
      return t(`${line.name} excluye ${line.path}.`, `${line.name} excludes ${line.path}.`);
    case "formatter-checks":
      return t(
        `${line.name} también revisa ${line.path}, que escribe Specty: añade ${line.add} en ${line.file}.`,
        `${line.name} also checks ${line.path}, which Specty writes: add ${line.add} to ${line.file}.`,
      );
    case "specty-reachable":
      return t(
        `Los hooks pueden ejecutar Specty (${line.command}).`,
        `Hooks can run Specty (${line.command}).`,
      );
    case "specty-unreachable":
      return t(
        "Los hooks no encuentran Specty: instálalo con `npm i -g @baquia-dev/specty`.",
        "Hooks cannot find Specty: install it with `npm i -g @baquia-dev/specty`.",
      );
    case "verify-default":
      return t(
        `Verificación por defecto: \`${line.command}\`.`,
        `Default verification: \`${line.command}\`.`,
      );
    case "no-verify-default":
      return t(
        "Falta verify.default en .specty/config.yaml.",
        "verify.default is missing in .specty/config.yaml.",
      );
    case "node":
      return t(`Node ${line.version}.`, `Node ${line.version}.`);
    case "old-node":
      return t(
        `Node ${line.version}: Specty necesita Node 22 o posterior.`,
        `Node ${line.version}: Specty needs Node 22 or later.`,
      );
    case "missing-paths": {
      const paths = line.paths.map((path) => `\`${path}\``).join(", ");
      return t(
        `AGENTS.md cita rutas que no existen: ${paths}. Corrígelas o quítalas: el agente lee AGENTS.md en cada sesión.`,
        `AGENTS.md cites paths that do not exist: ${paths}. Fix or remove them: the agent reads AGENTS.md every session.`,
      );
    }
    case "unfilled-sections": {
      const listed = (open: string, close: string, and: string) =>
        line.sections.map((title) => `${open}${title}${close}`).join(` ${and} `);
      return t(
        `AGENTS.md tiene sin completar ${listed("«", "»", "y")}: el agente lo lee en cada sesión, así que escribe ahí lo que el código no dice (los directorios cuyo propósito no es obvio, lo que no se toca, las reglas que no verifica \`specty check\`).`,
        `AGENTS.md has ${listed('"', '"', "and")} not filled in: the agent reads it every session, so write there what the code does not say (directories whose purpose is not obvious, what must not be touched, rules \`specty check\` does not verify).`,
      );
    }
    case "delegated":
      return t(
        `Modo delegado activo desde el ${line.since} (${line.by}): tu agente toma tus decisiones. Para desactivarlo: \`${command} delegate off\`.`,
        `Delegated mode on since ${line.since} (${line.by}): your agent makes your decisions. To turn it off: \`${command} delegate off\`.`,
      );
  }
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
