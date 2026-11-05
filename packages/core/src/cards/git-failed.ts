// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * Git failed inside a Specty command, which did not finish: `detail` is the git command and its
 * error on one line. The person or the agent fixes what made git fail and runs the command again.
 */
export function gitFailedCard(detail: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    ...blockedCard(
      headerOf(),
      t(
        `Git falló y Specty no terminó el comando: ${detail}.`,
        `Git failed and Specty did not finish the command: ${detail}.`,
      ),
      t(
        "corrige lo que hizo fallar a git (un hook, la firma, un archivo bloqueado…) y vuelve a ejecutar el comando.",
        "fix what made git fail (a hook, signing, a locked file…) and run the command again.",
      ),
    ),
    status: "invalid",
  };
}
