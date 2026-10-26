// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";

// What `init` says about the hooks it installs (layers 2 and 3 of ARCHITECTURE §10) and its commit.

export function claudePointerLine(lang: Lang): string {
  return translator(lang)("CLAUDE.md importa AGENTS.md.", "CLAUDE.md imports AGENTS.md.");
}

/** The guard of an agent tool whose hooks live in the repository: `local` when not committed. */
export function guardLine(tool: string, file: string, local: boolean, lang: Lang): string {
  const where = `${file}${local ? " (local)" : ""}`;
  return translator(lang)(`${tool}: guard en ${where}.`, `${tool}: guard in ${where}.`);
}

/** Codex's guard, in the user's configuration: it serves every repository. */
export function codexGuardLine(file: string, lang: Lang): string {
  return translator(lang)(
    `Codex: guard en ${file}, tu configuración de usuario: vale para todos tus repositorios y fuera de los que usan Specty no hace nada.`,
    `Codex: guard in ${file}, your user configuration: it applies to all your repositories and does nothing outside those using Specty.`,
  );
}

export function codexTrustWarning(lang: Lang): string {
  return translator(lang)(
    "Codex solo ejecuta el guard cuando confías en él: en Codex, abre `/hooks` y márcalo como de confianza. Basta una vez.",
    "Codex runs the guard only once you trust it: in Codex, open `/hooks` and trust it. Once is enough.",
  );
}

/** OpenCode's guard plugin, in its global configuration: it serves every repository. */
export function opencodeGuardLine(file: string, lang: Lang): string {
  return translator(lang)(
    `OpenCode: plugin del guard en ${file}, tu configuración global: vale para todos tus repositorios y fuera de los que usan Specty no hace nada.`,
    `OpenCode: guard plugin in ${file}, your global configuration: it applies to all your repositories and does nothing outside those using Specty.`,
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
