// SPDX-License-Identifier: Apache-2.0
import { HUMAN_COMMANDS } from "../guard/human";
import type { Lang } from "../i18n";
import { translator } from "./text";

// What `init` says about the hooks it installs (layers 2 and 3 of ARCHITECTURE §10) and its commit.

export function claudePointerLine(lang: Lang): string {
  return translator(lang)("CLAUDE.md importa AGENTS.md.", "CLAUDE.md imports AGENTS.md.");
}

export function geminiPointerLine(lang: Lang): string {
  return translator(lang)("GEMINI.md importa AGENTS.md.", "GEMINI.md imports AGENTS.md.");
}

/** The guard of an agent tool whose hooks live in the repository: `local` when not committed. */
export function guardLine(tool: string, file: string, local: boolean, lang: Lang): string {
  const where = `${file}${local ? " (local)" : ""}`;
  return translator(lang)(`${tool}: guard en ${where}.`, `${tool}: guard in ${where}.`);
}

/**
 * Codex's guard, in the project: Codex reads a linked worktree's hooks from the main checkout,
 * so one file serves every change (ADR 0013).
 */
export function codexGuardLine(file: string, local: boolean, lang: Lang): string {
  const where = `${file}${local ? " (local)" : ""}`;
  return translator(lang)(
    `Codex: guard en ${where}; desde Codex 0.131 sirve a todas las worktrees del repositorio.`,
    `Codex: guard in ${where}; since Codex 0.131 it serves every worktree of the repository.`,
  );
}

export function codexTrustWarning(lang: Lang): string {
  return translator(lang)(
    "Codex solo ejecuta el guard cuando confías en el proyecto y en el hook: confía en el proyecto cuando Codex lo pregunte y revisa el hook con `/hooks`. Basta una vez por repositorio.",
    "Codex runs the guard only once you trust the project and the hook: trust the project when Codex asks, and review the hook with `/hooks`. Once per repository is enough.",
  );
}

/**
 * Claude Code's permission for the person's commands, so its auto mode leaves them to Specty:
 * the guard still blocks them for the agent unless the person delegated (ADR 0010).
 */
export function claudePermissionsLine(
  command: string,
  file: string,
  local: boolean,
  lang: Lang,
): string {
  const t = translator(lang);
  const where = `${file}${local ? " (local)" : ""}`;
  const names = [...HUMAN_COMMANDS].map((name, index) =>
    index === 0 ? `\`${command} ${name}\`` : `\`${name}\``,
  );
  const list = `${names.slice(0, -1).join(", ")} ${t("y", "and")} ${names.at(-1) ?? ""}`;
  return t(
    `Claude Code: permisos en ${where} para que el agente ejecute ${list} sin el veto de Claude Code; Specty se los bloquea salvo en modo delegado.`,
    `Claude Code: permissions in ${where} so the agent runs ${list} without Claude Code's veto; Specty blocks them except in delegated mode.`,
  );
}

/** Codex's rule for Specty's commands: they commit to git, which its sandbox keeps read-only. */
export function codexRulesLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Codex: regla en ${file} para que los comandos de Specty se ejecuten sin preguntar y fuera del sandbox, que deja \`.git\` en solo lectura; Specty decide quién ejecuta cada uno.`,
    `Codex: rule in ${file} so Specty's commands run without asking and outside the sandbox, which keeps \`.git\` read-only; Specty decides who runs each one.`,
  );
}

/** Codex's project settings let its sandbox write in the worktrees' folder (`specty enter`). */
export function codexSandboxLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Codex: ${file} (local) deja escribir a su sandbox en la carpeta de las worktrees (\`writable_roots\`), para trabajar en la de un cambio desde la misma sesión (\`specty enter\`).`,
    `Codex: ${file} (local) lets its sandbox write in the worktrees' folder (\`writable_roots\`), to work in a change's from the same session (\`specty enter\`).`,
  );
}

/** Codex's project settings are the person's: Specty says what to add to them. */
export function codexSandboxKeptWarning(file: string, folder: string, lang: Lang): string {
  return translator(lang)(
    `Codex: Specty no escribe en ${file}, que ya existe; para que su sandbox escriba en la carpeta de un cambio desde la misma sesión (\`specty enter\`), añade \`${folder}\` a \`writable_roots\` en \`[sandbox_workspace_write]\`.`,
    `Codex: Specty does not write to ${file}, which already exists; for its sandbox to write in a change's folder from the same session (\`specty enter\`), add \`${folder}\` to \`writable_roots\` in \`[sandbox_workspace_write]\`.`,
  );
}

/**
 * Cursor's sandbox settings, local because they carry machine paths: the folders Specty's commands
 * write in from a change's folder, which the sandbox leaves out.
 */
export function cursorSandboxLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Cursor: ${file} (local) deja escribir a los comandos de Specty en la carpeta de git y en la de las worktrees, que su sandbox deja fuera.`,
    `Cursor: ${file} (local) lets Specty's commands write in the git folder and the worktrees' folder, which its sandbox leaves out.`,
  );
}

/** A sandbox file the person keeps in git: Specty leaves it alone and says what to add. */
export function cursorSandboxTrackedWarning(
  file: string,
  paths: readonly string[],
  lang: Lang,
): string {
  const list = paths.map((path) => `\`${path}\``).join(", ");
  return translator(lang)(
    `Cursor: ${file} está en git, así que Specty no lo toca; añade ${list} a \`additionalReadwritePaths\` para que los commits de Specty funcionen en su sandbox.`,
    `Cursor: ${file} is in git, so Specty leaves it alone; add ${list} to \`additionalReadwritePaths\` so Specty's commits work in its sandbox.`,
  );
}

/** Antigravity loads the workspace's hooks only from a folder the person trusts. */
export function antigravityTrustWarning(lang: Lang): string {
  return translator(lang)(
    "Antigravity solo carga .agents/hooks.json si confías en la carpeta del proyecto: confía en ella cuando te lo pregunte.",
    "Antigravity only loads .agents/hooks.json from a folder you trust: trust the project's folder when it asks.",
  );
}

/** Devin Desktop runs no hook of a workspace open in restricted mode. */
export function devinRestrictedWarning(lang: Lang): string {
  return translator(lang)(
    "Devin Desktop no carga los hooks en modo restringido: confía en la carpeta del proyecto cuando te lo pregunte.",
    "Devin Desktop loads no hooks in restricted mode: trust the project's folder when it asks.",
  );
}

/** Devin's rule for Specty's commands, shared like Codex's: Specty decides who runs each one. */
export function devinCommandsLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Devin (Windsurf): regla en ${file} para que los comandos de Specty se ejecuten sin preguntar; Specty decide quién ejecuta cada uno.`,
    `Devin (Windsurf): rule in ${file} so Specty's commands run without asking; Specty decides who runs each one.`,
  );
}

/** Devin's sandbox, opt-in, with Specty's folders as `Write(...)` scopes in its local settings. */
export function devinSandboxLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Devin (Windsurf): ${file} (local) deja escribir a los comandos de Specty en la carpeta de git y en la de las worktrees cuando activas su sandbox.`,
    `Devin (Windsurf): ${file} (local) lets Specty's commands write in the git folder and the worktrees' folder when you turn its sandbox on.`,
  );
}

/** Devin's local settings kept in git: no machine path, so Specty says what to add elsewhere. */
export function devinSandboxTrackedWarning(
  file: string,
  rules: readonly string[],
  lang: Lang,
): string {
  const list = rules.map((rule) => `\`${rule}\``).join(", ");
  return translator(lang)(
    `Devin (Windsurf): ${file} está en git, así que Specty no le añade rutas de esta máquina; si activas su sandbox, añade ${list} a \`permissions.allow\` en tu configuración de usuario para que funcionen los commits de Specty.`,
    `Devin (Windsurf): ${file} is in git, so Specty adds no path of this machine to it; if you turn its sandbox on, add ${list} to \`permissions.allow\` in your user settings so Specty's commits work.`,
  );
}

/** Gemini CLI keeps a fingerprint of each project hook, and loads none from a folder not trusted. */
export function geminiTrustWarning(lang: Lang): string {
  return translator(lang)(
    "Gemini CLI avisa antes de ejecutar un hook nuevo o cambiado del proyecto: acepta los de Specty cuando te lo pregunte. Tampoco los carga en una carpeta en la que no confíes.",
    "Gemini CLI asks before running a new or changed project hook: accept Specty's when it asks. It does not load them in a folder you do not trust either.",
  );
}

/**
 * Gemini CLI's sandbox, off unless the person turns it on, with Specty's folders in its local
 * settings: the ones Specty's commands write in from a change's folder.
 */
export function geminiSandboxLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Gemini CLI: ${file} (local) deja escribir a los comandos de Specty en la carpeta de git y en la de las worktrees cuando activas su sandbox.`,
    `Gemini CLI: ${file} (local) lets Specty's commands write in the git folder and the worktrees' folder when you turn its sandbox on.`,
  );
}

/** Gemini CLI's local settings open the worktrees' folder to its tools (`specty enter`). */
export function geminiWorkspaceLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Gemini CLI: ${file} (local) abre a sus herramientas la carpeta de las worktrees (\`context.includeDirectories\`), para trabajar en la de un cambio desde la misma sesión (\`specty enter\`); Gemini CLI puede preguntar una vez si confías en ella.`,
    `Gemini CLI: ${file} (local) opens the worktrees' folder to its tools (\`context.includeDirectories\`), to work in a change's from the same session (\`specty enter\`); Gemini CLI may ask once whether you trust it.`,
  );
}

/** Gemini CLI settings that go in git: Specty says which folder to open to its tools elsewhere. */
export function geminiWorkspaceVersionedWarning(file: string, folder: string, lang: Lang): string {
  return translator(lang)(
    `Gemini CLI: ${file} va en git, así que Specty no le añade la carpeta de las worktrees; para trabajar en la de un cambio desde la misma sesión (\`specty enter\`), añade \`${folder}\` a \`context.includeDirectories\` en tu configuración de usuario.`,
    `Gemini CLI: ${file} goes in git, so Specty does not add the worktrees' folder to it; to work in a change's from the same session (\`specty enter\`), add \`${folder}\` to \`context.includeDirectories\` in your user settings.`,
  );
}

/** Gemini CLI settings that go in git: no machine path, so Specty says what to add elsewhere. */
export function geminiSandboxVersionedWarning(
  file: string,
  paths: readonly string[],
  lang: Lang,
): string {
  const list = paths.map((path) => `\`${path}\``).join(", ");
  return translator(lang)(
    `Gemini CLI: ${file} va en git, así que Specty no le añade rutas de esta máquina; si activas su sandbox, añade ${list} a \`tools.sandboxAllowedPaths\` en tu configuración de usuario para que funcionen los commits de Specty.`,
    `Gemini CLI: ${file} goes in git, so Specty adds no path of this machine to it; if you turn its sandbox on, add ${list} to \`tools.sandboxAllowedPaths\` in your user settings so Specty's commits work.`,
  );
}

/** OpenCode's guard plugin, in the project (ADR 0013): `local` when not committed. */
export function opencodeGuardLine(file: string, local: boolean, lang: Lang): string {
  const where = `${file}${local ? " (local)" : ""}`;
  return translator(lang)(
    `OpenCode: plugin del guard en ${where}.`,
    `OpenCode: guard plugin in ${where}.`,
  );
}

/** OpenCode's local settings let it work in the worktrees' folder (`specty enter`). */
export function opencodeWorktreesLine(file: string, lang: Lang): string {
  return translator(lang)(
    `OpenCode: ${file} (local) le deja trabajar en la carpeta de las worktrees (\`permission.external_directory\`), para entrar en la de un cambio desde la misma sesión (\`specty enter\`).`,
    `OpenCode: ${file} (local) lets it work in the worktrees' folder (\`permission.external_directory\`), to enter a change's from the same session (\`specty enter\`).`,
  );
}

/** OpenCode settings that go in git: Specty says what to allow elsewhere. */
export function opencodeWorktreesVersionedWarning(
  file: string,
  pattern: string,
  lang: Lang,
): string {
  return translator(lang)(
    `OpenCode: ${file} va en git, así que Specty no le añade la carpeta de las worktrees; para trabajar en la de un cambio desde la misma sesión (\`specty enter\`), permite \`${pattern}\` en \`permission.external_directory\` de tu configuración de usuario.`,
    `OpenCode: ${file} goes in git, so Specty does not add the worktrees' folder to it; to work in a change's from the same session (\`specty enter\`), allow \`${pattern}\` in \`permission.external_directory\` of your user settings.`,
  );
}

/** Agent tools Specty has no hooks for yet: the other layers still protect them. */
export function noHooksWarning(tools: readonly string[], lang: Lang): string {
  return translator(lang)(
    `Sin hooks todavía para: ${tools.join(", ")}. Los protegen los hooks de git y el CI.`,
    `No hooks yet for: ${tools.join(", ")}. Git hooks and CI still protect them.`,
  );
}

export function gitHooksLine(manager: string, lang: Lang): string {
  return translator(lang)(
    `Git: hooks pre-commit y prepare-commit-msg (${manager}).`,
    `Git: pre-commit and prepare-commit-msg hooks (${manager}).`,
  );
}

/** A hook manager Specty cannot configure itself: what the person adds by hand. */
export function gitHooksManualWarning(manager: string, manual: string, lang: Lang): string {
  return translator(lang)(
    `Añade a la configuración de ${manager}: ${manual}`,
    `Add to the ${manager} configuration: ${manual}`,
  );
}

/** The hooks call this script by its path, which only works on this machine. */
export function notOnPathWarning(command: string, lang: Lang): string {
  return translator(lang)(
    `\`${command}\` no está en el PATH: los hooks usan la ruta de este script. Instálalo con \`npm i -g @baquia-dev/specty\` para que funcionen en cualquier máquina.`,
    `\`${command}\` is not on PATH: hooks use this script's path. Install it with \`npm i -g @baquia-dev/specty\` so they work on any machine.`,
  );
}

/** With a change in progress here, `init` commits nothing: the files would land on its branch. */
export function changeInProgressWarning(id: string, command: string, lang: Lang): string {
  return translator(lang)(
    `Esta carpeta tiene un cambio activo (${id}): los archivos de Specty quedan sin commit. Ejecuta \`${command} init\` en la carpeta principal.`,
    `This folder has a change in progress (${id}): Specty's files stay uncommitted. Run \`${command} init\` in the main folder.`,
  );
}

/** Files that already had the person's changes: `init` leaves them out of its commit. */
export function yoursUncommittedWarning(paths: readonly string[], lang: Lang): string {
  return translator(lang)(
    `Ya tenían cambios tuyos y quedan sin commit: ${paths.join(", ")}.`,
    `They already had your changes and stay uncommitted: ${paths.join(", ")}.`,
  );
}

/** The subject of `init`'s commit: the first installation, or an update of it. */
export function installCommitSubject(first: boolean, lang: Lang): string {
  const t = translator(lang);
  return first
    ? t("chore(specty): instalar Specty", "chore(specty): install Specty")
    : t(
        "chore(specty): actualizar la instalación de Specty",
        "chore(specty): update Specty's installation",
      );
}

export function installCommitLine(commit: string, paths: readonly string[], lang: Lang): string {
  return translator(lang)(
    `Commit ${commit}: ${paths.join(", ")}.`,
    `Commit ${commit}: ${paths.join(", ")}.`,
  );
}
