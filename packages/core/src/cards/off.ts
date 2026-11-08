// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

/** Who turned Specty off, and when (an ISO date in UTC). */
export interface OffView {
  readonly by: string;
  readonly at: string;
}

/**
 * `specty next` with Specty off: nothing the agent does goes through Specty, so it works without
 * the flow until the person turns it back on.
 */
export function offCard(off: OffView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const day = off.at.slice(0, 10);
  const time = off.at.slice(11, 16);
  return {
    status: "ok",
    header: headerOf(t("apagado", "off")),
    blocks: section(undefined, [
      t(
        `Specty está apagado desde el ${day} a las ${time} UTC: lo apagó ${off.by}.`,
        `Specty has been off since ${day} at ${time} UTC: ${off.by} turned it off.`,
      ),
      t(
        "Nada de lo que hagas pasa por Specty: ni el guard, ni los hooks de git, ni el fin de turno.",
        "Nothing you do goes through Specty: not the guard, the git hooks or the end of turn.",
      ),
      t(
        "Los cambios abiertos siguen como están, y continúan cuando la persona lo vuelva a encender.",
        "Open changes stay as they are, and go on when the person turns it back on.",
      ),
    ]),
    next: t(
      "haz lo que pide el usuario sin spec ni comandos de Specty.",
      "do what the user asks without a spec or Specty commands.",
    ),
  };
}
