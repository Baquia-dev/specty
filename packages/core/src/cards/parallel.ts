// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

// Working in parallel, a worktree per change: files another open change also lists, preparing a
// new folder, and cleaning up the folders and branches of finished changes (`prune`).

/** A file another open change also lists, and those changes. */
export function sharedLine(path: string, changes: readonly string[], lang: Lang): string {
  return translator(lang)(
    `${path} — también en ${changes.join(", ")}`,
    `${path} — also in ${changes.join(", ")}`,
  );
}

export function sharedTitle(lang: Lang): string {
  return translator(lang)("ARCHIVOS COMPARTIDOS", "SHARED FILES");
}

/** What Specty prints on stderr while it prepares a new change's folder. */
export function preparingNote(command: string, lang: Lang): string {
  return `specty: ${translator(lang)("preparando la carpeta con", "preparing the folder with")} \`${command}\`…`;
}

/** A finished change's folder kept, because an agent session still works in it. */
export function workingFolderLine(folder: string, lang: Lang): string {
  return translator(lang)(
    `${folder}: una sesión de agente trabaja en ella.`,
    `${folder}: an agent session works in it.`,
  );
}

/** A folder kept, because its change has not reached the main branch yet. */
export function notInTargetFolderLine(
  folder: string,
  id: string,
  target: string,
  lang: Lang,
): string {
  return translator(lang)(
    `${folder}: ${id} aún no está en ${target}.`,
    `${folder}: ${id} is not in ${target} yet.`,
  );
}

/** A branch kept, because the main branch does not contain it. */
export function notInTargetBranchLine(branch: string, target: string, lang: Lang): string {
  return translator(lang)(`${branch}: no está en ${target}.`, `${branch}: not in ${target}.`);
}

/** `specty prune`: the folders and branches it removed, and the ones it kept, with why. */
export function pruneCard(
  pruned: {
    readonly folders: readonly string[];
    readonly branches: readonly string[];
    readonly kept: readonly string[];
  },
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const nothing = pruned.folders.length === 0 && pruned.branches.length === 0;
  return {
    status: "ok",
    header: headerOf(t("limpieza", "cleanup")),
    blocks: [
      ...section(
        undefined,
        nothing ? [t("No había nada que limpiar.", "There was nothing to clean up.")] : [],
      ),
      ...section(t("CARPETAS BORRADAS", "FOLDERS REMOVED"), pruned.folders),
      ...section(t("RAMAS BORRADAS", "BRANCHES DELETED"), pruned.branches),
      ...section(t("QUEDAN", "KEPT"), pruned.kept),
    ],
    next: t(
      `para otro cambio, \`${ctx.command} new "<título>"\`.`,
      `for another change, \`${ctx.command} new "<title>"\`.`,
    ),
  };
}
