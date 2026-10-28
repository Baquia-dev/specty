// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";

export interface BlockedCommitView {
  readonly paths: readonly string[];
  /** Active change whose scope the paths fall outside of, if any. */
  readonly change?: string;
  /** The change is implementing a task, so `retro --into` can document the paths in it. */
  readonly into?: boolean;
  readonly minimalAllowed: boolean;
  readonly command: string;
}

/** Message printed by the pre-commit hook when a commit carries code without a spec. */
export function blockedCommitMessage(view: BlockedCommitView, lang: Lang): string {
  const t = translator(lang);
  const lead =
    view.change === undefined
      ? t(
          "specty: este commit incluye código gobernado sin una spec aprobada:",
          "specty: this commit includes governed code without an approved spec:",
        )
      : t(
          `specty: este commit incluye código fuera del alcance de ${view.change}:`,
          `specty: this commit includes code outside the scope of ${view.change}:`,
        );
  const minimal = view.minimalAllowed
    ? [
        t(
          `  • O documéntalo tú mismo: ${view.command} retro --minimal`,
          `  • Or document it yourself: ${view.command} retro --minimal`,
        ),
      ]
    : [];
  const retro =
    view.into === true && view.change !== undefined ? `retro --into ${view.change}` : "retro";
  return [
    lead,
    ...view.paths.map((path) => `  - ${path}`),
    "",
    t("Para documentarlo:", "To document it:"),
    t(
      `  • Pídele a tu agente: «Documenta los cambios preparados con specty ${retro}».`,
      `  • Ask your agent: "Document the staged changes with specty ${retro}".`,
    ),
    ...minimal,
    t("Después repite git commit.", "Then run git commit again."),
  ].join("\n");
}

/** The pre-commit hook's line before the report of `specty check --staged`, when it fails. */
export function checkStagedFailedLine(lang: Lang): string {
  return translator(lang)(
    "specty: el commit no pasa `specty check --staged`:",
    "specty: the commit does not pass `specty check --staged`:",
  );
}

/** The agent's end-of-turn line before the report of `specty check --changed`, when it fails. */
export function checkChangedFailedLine(lang: Lang): string {
  return translator(lang)(
    "`specty check --changed` falla; corrígelo antes de terminar el turno:",
    "`specty check --changed` fails; fix it before ending the turn:",
  );
}

/** Why Claude Code's `WorktreeCreate` or `WorktreeRemove` hook refuses (ARCHITECTURE §10). */
export type WorktreeHookRefusal =
  | { readonly reason: "no-repository"; readonly cwd: string }
  | { readonly reason: "invalid-name"; readonly name: string }
  | { readonly reason: "no-folder" }
  /** A change's folder stays while the change is open: `close` removes it once merged. */
  | { readonly reason: "change-folder"; readonly folder: string; readonly command: string };

export function worktreeHookRefusal(refusal: WorktreeHookRefusal, lang: Lang): string {
  const t = translator(lang);
  switch (refusal.reason) {
    case "no-repository":
      return t(
        `${refusal.cwd} no está en un repositorio de git.`,
        `${refusal.cwd} is not in a git repository.`,
      );
    case "invalid-name":
      return t(
        `Nombre de worktree no válido: «${refusal.name}».`,
        `Invalid worktree name: "${refusal.name}".`,
      );
    case "no-folder":
      return t("Falta la carpeta de la worktree.", "The worktree's folder is missing.");
    case "change-folder":
      return t(
        `${refusal.folder} es la carpeta de un cambio de Specty: se queda mientras el cambio siga abierto, y \`${refusal.command} close\` la borra al incorporarlo.`,
        `${refusal.folder} is a Specty change's folder: it stays while the change is open, and \`${refusal.command} close\` removes it once the change is merged.`,
      );
  }
}
