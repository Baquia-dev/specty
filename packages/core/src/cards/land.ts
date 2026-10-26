// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";
import type { CardContext } from "./view";

// Landing a closed change on the main branch, and leaving its folder (ARCHITECTURE §9).

export function landedLine(target: string, lang: Lang): string {
  return translator(lang)(`Incorporado a ${target}.`, `Merged into ${target}.`);
}

/** The main branch did not move to the change: `failure` says why. */
export function notLandedLine(target: string, failure: string, lang: Lang): string {
  return translator(lang)(`${target} no avanzó: ${failure}`, `${target} did not move: ${failure}`);
}

/** Why the main branch, checked out nowhere, cannot move: someone added commits to it. */
export function targetAheadLine(lang: Lang): string {
  return translator(lang)(
    "ya tiene commits que el cambio no incluye.",
    "it already has commits the change does not include.",
  );
}

/** The main folder, where the change lived, is back on the main branch. */
export function backOnTargetLine(target: string, lang: Lang): string {
  return translator(lang)(`Esta carpeta vuelve a ${target}.`, `This folder is back on ${target}.`);
}

export function folderRemovedLine(
  folder: string,
  branch: string,
  main: string,
  lang: Lang,
): string {
  return translator(lang)(
    `La carpeta ${folder} se eliminó y la rama ${branch} queda; sigue en ${main}.`,
    `Folder ${folder} was removed and branch ${branch} stays; carry on in ${main}.`,
  );
}

/** The change's folder could not be removed: `failure` is git's last line. */
export function folderStaysLine(folder: string, failure: string, lang: Lang): string {
  return translator(lang)(
    `La carpeta ${folder} queda: ${failure} Bórrala con \`git worktree remove\` cuando ya no la necesites.`,
    `Folder ${folder} stays: ${failure} Remove it with \`git worktree remove\` when you no longer need it.`,
  );
}

/** The change is closed but did not reach the main branch: closing again retries only that. */
export function retryLandingNext(ctx: CardContext): string {
  return translator(ctx.lang)(
    `cuando se pueda, vuelve a ejecutar \`${ctx.command} close\` para incorporarlo.`,
    `when possible, run \`${ctx.command} close\` again to merge it.`,
  );
}

/** The agent that closed works inside the change's folder: it leaves it for the main one. */
export function leaveFolderNext(
  left: { readonly folder: string; readonly main: string; readonly removed: boolean },
  ctx: CardContext,
): string {
  const t = translator(ctx.lang);
  const leave = left.removed
    ? t(`${left.folder} ya no existe: sal de ella`, `${left.folder} no longer exists: leave it`)
    : t(`sal de ${left.folder}`, `leave ${left.folder}`);
  return t(
    `${leave} (en Claude Code, \`ExitWorktree\`) y sigue en ${left.main}; para otro cambio, \`${ctx.command} new "<título>"\`.`,
    `${leave} (in Claude Code, \`ExitWorktree\`) and carry on in ${left.main}; for another change, \`${ctx.command} new "<title>"\`.`,
  );
}
