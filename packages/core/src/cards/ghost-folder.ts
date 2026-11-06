// SPDX-License-Identifier: Apache-2.0
import type { GhostPath } from "../guard/worktrees";
import type { Lang } from "../i18n";
import { translator } from "./text";

/**
 * Why the guard does not let an agent write or delete in a ghost folder (`GhostPath`), and how
 * to carry on: in the main folder, as after `close`, or with `specty restore` when it is the
 * folder of an open change that lost it.
 */
export function ghostFolderDenial(
  { path, folder, main, lost }: GhostPath,
  lang: Lang,
  command: string,
): { readonly reason: string; readonly next: string } {
  const t = translator(lang);
  if (lost !== undefined) {
    return {
      reason: t(
        `\`${path}\` está en \`${folder}\`, que ya no es una worktree de git: es la carpeta del cambio ${lost}, que sigue abierto en su rama, y escribir allí la volvería a crear sin git.`,
        `\`${path}\` is in \`${folder}\`, which is no longer a git worktree: it is the folder of change ${lost}, still open on its branch, and writing there would bring it back without git.`,
      ),
      next: t(
        `recupérala con \`${command} restore ${lost}\` y sigue su salida, que dice cómo volver a ella.`,
        `bring it back with \`${command} restore ${lost}\` and follow its output, which tells how to go back to it.`,
      ),
    };
  }
  return {
    reason: t(
      `\`${path}\` está en \`${folder}\`, que ya no es la carpeta de ningún cambio: git no la tiene como worktree (se quitó al cerrar o cancelar su cambio, o se borró), y escribir allí la volvería a crear sin git.`,
      `\`${path}\` is in \`${folder}\`, which is no longer any change's folder: git does not have it as a worktree (it was removed when its change was closed or cancelled, or deleted), and writing there would bring it back without git.`,
    ),
    next: t(
      `sal de ella si trabajas allí (en Claude Code, \`ExitWorktree\`) y sigue en \`${main}\`; para otro cambio, \`${command} new "<título>"\`.`,
      `leave it if you work there (in Claude Code, \`ExitWorktree\`) and carry on in \`${main}\`; for another change, \`${command} new "<title>"\`.`,
    ),
  };
}
