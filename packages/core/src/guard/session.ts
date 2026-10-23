// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

/** The worktree an agent session is bound to, and its change while that change is still open. */
export interface BoundSession {
  readonly folder: string;
  /** The open change of that folder; undefined once it is closed, cancelled or gone. */
  readonly change?: string;
}

/**
 * Why an agent session may not enter the worktree `target`: it already works in another one whose
 * change is still open, and a session works one change at a time. Undefined when it may.
 */
export function sessionDenial(
  bound: BoundSession | undefined,
  target: string,
  lang: Lang,
  command: string,
): { readonly reason: string; readonly next: string } | undefined {
  if (bound?.change === undefined || bound.folder === target) return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return {
    reason: t(
      `Esta sesión trabaja en \`${bound.folder}\` (cambio ${bound.change}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
      `This session works in \`${bound.folder}\` (change ${bound.change}, still open): a session works on one change at a time.`,
    ),
    next: t(
      `termina ese cambio (\`${command} next\` allí), o abre otra sesión en \`${target}\` para trabajar en ese.`,
      `finish that change (\`${command} next\` there), or open another session in \`${target}\` to work on that one.`,
    ),
  };
}
