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
  /** The same path inside the change's folder the conversation entered with `specty enter`. */
  readonly instead?: string;
}

/** A command that would run outside the change's folder the conversation entered. */
export interface Elsewhere {
  readonly folder: string;
  readonly command: string;
}

type Denial = { readonly reason: string; readonly next: string };

/**
 * Why an agent may not change files of another worktree: each change in parallel is edited only
 * from the session opened in its own folder, or from a conversation that entered it, which is
 * given the same path there. Undefined when nothing is foreign.
 */
export function foreignDenial(foreign: readonly ForeignPath[], lang: Lang): Denial | undefined {
  const [first] = foreign;
  if (first === undefined) return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  if (first.instead !== undefined) {
    return {
      reason: t(
        `\`${first.path}\` está fuera de la carpeta en la que trabaja esta conversación.`,
        `\`${first.path}\` is outside the folder this conversation works in.`,
      ),
      next: t(
        `usa la misma ruta dentro de ella: \`${first.instead}\`.`,
        `use the same path inside it: \`${first.instead}\`.`,
      ),
    };
  }
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

/** A conversation that entered a change's folder runs its commands there. */
export function elsewhereDenial({ folder, command }: Elsewhere, lang: Lang): Denial {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const there = `cd '${folder.replaceAll("'", `'\\''`)}' && ${command}`;
  return {
    reason: t(
      `Esta conversación trabaja en \`${folder}\`: este comando correría fuera de esa carpeta.`,
      `This conversation works in \`${folder}\`: this command would run outside that folder.`,
    ),
    next: t(`ejecútalo allí: \`${there}\`.`, `run it there: \`${there}\`.`),
  };
}

/** Claude Code enters a change's folder with its own tool, which moves its whole session there. */
export function nativeEnterDenial(id: string, lang: Lang): Denial {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return {
    reason: t(
      "Claude Code entra en la carpeta de un cambio con su propia herramienta, que lleva allí toda la sesión.",
      "Claude Code enters a change's folder with its own tool, which moves the whole session there.",
    ),
    next: t(
      `usa \`EnterWorktree\` con \`name: "${id}"\`.`,
      `use \`EnterWorktree\` with \`name: "${id}"\`.`,
    ),
  };
}
