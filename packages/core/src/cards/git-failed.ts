// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * Git failed inside a Specty command, which did not finish: `detail` is the git command and its
 * error on one line. With `undone`, the command removed what it had created before the failure,
 * such as `specty new`'s folder and branch, so running it again starts afresh. The person or the
 * agent fixes what made git fail and runs the command again.
 */
export function gitFailedCard(
  detail: string,
  ctx: CardContext,
  undone?: { readonly folder: string; readonly branch: string },
): Output {
  const t = translator(ctx.lang);
  const lines = [
    t(
      `Git falló y Specty no terminó el comando: ${detail}.`,
      `Git failed and Specty did not finish the command: ${detail}.`,
    ),
    ...(undone === undefined
      ? []
      : [
          t(
            `Specty deshizo lo que había creado: la carpeta ${undone.folder} y la rama ${undone.branch}.`,
            `Specty undid what it had created: the folder ${undone.folder} and the branch ${undone.branch}.`,
          ),
        ]),
  ];
  return {
    status: "invalid",
    header: headerOf(),
    blocks: section(undefined, lines),
    next: t(
      "corrige lo que hizo fallar a git (un hook, la firma, un archivo bloqueado…) y vuelve a ejecutar el comando.",
      "fix what made git fail (a hook, signing, a locked file…) and run the command again.",
    ),
  };
}
