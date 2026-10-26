// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty ui`, the local server of every worktree's changes (ARCHITECTURE §15).

/** `--port` is not a port number. */
export function invalidPortCard(port: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    ...blockedCard(
      headerOf("ui"),
      t(`Puerto no válido: ${port}.`, `Invalid port: ${port}.`),
      t("usa `--port` con un número de 1 a 65535.", "use `--port` with a number from 1 to 65535."),
    ),
    status: "invalid",
  };
}

/**
 * The server is up: its link, and whether the person can decide from it (`actions`) or it is
 * read only, because an agent started it.
 */
export function uiOpenedCard(link: string, actions: boolean, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf("ui"),
    blocks: section(undefined, [
      t(
        `Los cambios de todas las worktrees, en ${link}`,
        `The changes of every worktree, at ${link}`,
      ),
      actions
        ? t(
            "Desde la UI puedes aprobar, decidir el alcance, aceptar y cerrar.",
            "From the UI you can approve, decide scope, accept and close.",
          )
        : t(
            "Solo lectura: lo arrancó el agente. Para decidir desde la UI, arráncalo tú con `specty ui`.",
            "Read only: the agent started it. To decide from the UI, start it yourself with `specty ui`.",
          ),
    ]),
    next: t(
      "abre el enlace en tu navegador; Ctrl+C cierra el servidor.",
      "open the link in your browser; Ctrl+C stops the server.",
    ),
  };
}

export function uiStoppedCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf("ui"),
    blocks: section(undefined, [t("Servidor cerrado.", "Server stopped.")]),
    next: t(
      `ábrelo otra vez con \`${ctx.command} ui\`.`,
      `open it again with \`${ctx.command} ui\`.`,
    ),
  };
}
