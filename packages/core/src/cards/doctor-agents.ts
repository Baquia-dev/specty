// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES } from "../agents";
import type { DoctorLine } from "./doctor";
import type { Translate } from "./text";

type AgentCode =
  | "claude-guard"
  | "no-claude-guard"
  | "claude-after-bash"
  | "claude-worktrees"
  | "claude-compact"
  | "no-claude-permissions"
  | "cursor-guard"
  | "no-cursor-guard"
  | "cursor-compact"
  | "cursor-sandbox"
  | "no-cursor-sandbox"
  | "cursor-after-command"
  | "codex-guard"
  | "no-codex-guard"
  | "codex-compact"
  | "codex-rules"
  | "no-codex-rules"
  | "opencode-guard"
  | "opencode-after-command"
  | "opencode-compact"
  | "no-opencode-guard"
  | "antigravity-guard"
  | "no-antigravity-guard"
  | "antigravity-hooks"
  | "windsurf-guard"
  | "no-windsurf-guard"
  | "windsurf-hooks"
  | "gemini-guard"
  | "no-gemini-guard"
  | "gemini-hooks"
  | "enter-outdated";

/** The lines of `doctor` about each agent's installation, which `cards/doctor.ts` adds to its own. */
export const AGENT_WRITERS: {
  readonly [C in AgentCode]: (
    line: DoctorLine & { readonly code: C },
    t: Translate,
    command: string,
  ) => string;
} = {
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
  "enter-outdated": (line, t, command) =>
    t(
      `${AGENT_NAMES[line.tool]}: ${line.file} es de antes de \`${command} enter\`, así que no lleva sus acciones a la carpeta de un cambio; ejecuta \`${command} init --tools ${line.tool}\`.`,
      `${AGENT_NAMES[line.tool]}: ${line.file} predates \`${command} enter\`, so it does not carry its actions to a change's folder; run \`${command} init --tools ${line.tool}\`.`,
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
};
