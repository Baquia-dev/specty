// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

/** A path inside another worktree of the repository: it belongs to another change. */
export interface ForeignPath {
  /** Absolute path, as the action would change it. */
  readonly path: string;
  /** Folder of the worktree that contains it. */
  readonly worktree: string;
  /** That worktree's branch, unless it is detached. */
  readonly branch?: string;
}

/**
 * Why an agent may not change files of another worktree: each change in parallel is edited only
 * from the session opened in its own folder. Undefined when nothing is foreign.
 */
export function foreignDenial(
  foreign: readonly ForeignPath[],
  lang: Lang,
): { readonly reason: string; readonly next: string } | undefined {
  const [first] = foreign;
  if (first === undefined) return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const where =
    first.branch === undefined
      ? `\`${first.worktree}\``
      : t(
          `\`${first.worktree}\`, rama ${first.branch}`,
          `\`${first.worktree}\`, branch ${first.branch}`,
        );
  return {
    reason: t(
      `\`${first.path}\` está en otra worktree (${where}): es de otro cambio.`,
      `\`${first.path}\` is in another worktree (${where}): it belongs to another change.`,
    ),
    next: t(
      `trabaja solo con los archivos de esta carpeta; ese cambio se edita desde una sesión abierta en \`${first.worktree}\`.`,
      `work only with this folder's files; that change is edited from a session opened in \`${first.worktree}\`.`,
    ),
  };
}
