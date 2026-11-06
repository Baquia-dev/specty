// SPDX-License-Identifier: Apache-2.0
import type { OpenFolder } from "../guard/worktrees";
import type { Lang } from "../i18n";
import { translator } from "./text";

/**
 * Why the guard does not let an agent remove the folder of an open change (`OpenFolder`), with
 * `git worktree remove` or a tool of its own, and who removes it: `cancel`, which first keeps on
 * the change's branch what it has uncommitted, or `close`.
 */
export function openFolderDenial(
  { folder, id }: OpenFolder,
  lang: Lang,
  command: string,
): { readonly reason: string; readonly next: string } {
  const t = translator(lang);
  return {
    reason: t(
      `\`${folder}\` es la carpeta del cambio ${id}, que sigue abierto: se queda mientras no se cierre ni se cancele, y quitarla con \`--force\` perdería lo que tiene sin commit.`,
      `\`${folder}\` is the folder of change ${id}, still open: it stays until the change is closed or cancelled, and removing it with \`--force\` would lose what it has uncommitted.`,
    ),
    next: t(
      `no la quites. Si ese cambio ya no sigue, \`${command} cancel ${id}\` guarda en su rama lo que tiene sin commit y quita la carpeta; al terminarlo, \`${command} close\` la quita.`,
      `do not remove it. If that change is not going on, \`${command} cancel ${id}\` saves on its branch what it has uncommitted and removes the folder; once it is done, \`${command} close\` removes it.`,
    ),
  };
}
