// SPDX-License-Identifier: Apache-2.0
import type { DoctorLine } from "./doctor";
import type { Translate } from "./text";

/**
 * What `doctor` says of the orphans the clean-up of `prune` removes and of the rescue refs it
 * left (ARCHITECTURE §9): warnings, which never turn it red.
 */

type CleanupCode =
  | "stale-records"
  | "finished-folders"
  | "ghost-folders"
  | "empty-change-folders"
  | "rescue-refs";

/** The lines of `doctor` about the clean-up, which `cards/doctor.ts` adds to its own. */
export const CLEANUP_WRITERS: {
  readonly [C in CleanupCode]: (
    line: DoctorLine & { readonly code: C },
    t: Translate,
    command: string,
  ) => string;
} = {
  "stale-records": (line, t, command) =>
    t(
      `Registros de git de worktrees cuya carpeta ya no existe: ${line.count}; los olvida \`${command} prune\`.`,
      `Git records of worktrees whose folder no longer exists: ${line.count}; \`${command} prune\` forgets them.`,
    ),
  "finished-folders": (line, t, command) =>
    t(
      `Carpetas de cambios terminados que ya no hacen falta: ${line.count}; las quita \`${command} prune\`, tras guardar en una ref de rescate lo que tengan sin commit.`,
      `Folders of finished changes no longer needed: ${line.count}; \`${command} prune\` removes them, after saving in a rescue ref what they have uncommitted.`,
    ),
  "ghost-folders": (line, t, command) =>
    t(
      `Carpetas fantasma, que no son worktrees de git, en .worktrees/ o en la carpeta hermana: ${line.count}; las borra \`${command} prune\`, tras guardar en una ref de rescate lo que git no ignora de ellas.`,
      `Ghost folders, which are not git worktrees, in .worktrees/ or in the sibling folder: ${line.count}; \`${command} prune\` removes them, after saving in a rescue ref what git does not ignore in them.`,
    ),
  "empty-change-folders": (line, t, command) =>
    t(
      `Carpetas vacías en .specty/changes/: ${line.count}; las borra \`${command} prune\`.`,
      `Empty folders in .specty/changes/: ${line.count}; \`${command} prune\` removes them.`,
    ),
  "rescue-refs": ({ count, latest }, t) =>
    t(
      `Refs de rescate, con lo que guardó la limpieza de las carpetas que quitó: ${count}. La más reciente es ${latest}: mírala con \`git show ${latest}\` y recupérala con \`git worktree add <carpeta> ${latest}\`; lista las demás con \`git for-each-ref refs/specty/rescue/\`. Quedan hasta que las borres con \`git update-ref -d <ref>\`.`,
      `Rescue refs, with what the clean-up saved of the folders it removed: ${count}. The latest is ${latest}: see it with \`git show ${latest}\` and get it back with \`git worktree add <folder> ${latest}\`; list the others with \`git for-each-ref refs/specty/rescue/\`. They stay until you delete them with \`git update-ref -d <ref>\`.`,
    ),
};
