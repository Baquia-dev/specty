// SPDX-License-Identifier: Apache-2.0
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockedCard,
  headerOf,
  type Output,
  renderText,
  section,
  translator,
} from "@baquia-dev/specty-core";
import { exists } from "../io/files";
import { startServer } from "../server/http";
import { COMMAND, type Session } from "../session";

const DEFAULT_PORT = 4173;

/** The built UI: next to the bundle once it ships with it, or the monorepo's own build. */
async function uiFolder(): Promise<string | undefined> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const folder of [join(here, "ui"), resolve(here, "../../ui/dist/browser")]) {
    if (await exists(join(folder, "index.html"))) return folder;
  }
  return undefined;
}

/** Resolves on Ctrl+C or when the process is asked to stop. */
function stopRequested(): Promise<void> {
  return new Promise((done) => {
    process.once("SIGINT", () => done());
    process.once("SIGTERM", () => done());
  });
}

/**
 * `specty ui`: serves the changes of every worktree on localhost (ARCHITECTURE §15) and prints
 * the link to open, until `stop` resolves (Ctrl+C by default). For now it only reads.
 */
export async function ui(
  session: Session,
  port: string | undefined,
  stop: Promise<void> = stopRequested(),
): Promise<Output> {
  const t = translator(session.lang);
  const first = port === undefined ? DEFAULT_PORT : Number(port);
  if (!Number.isInteger(first) || first < 0 || first > 65_535) {
    return {
      ...blockedCard(
        headerOf("ui"),
        t(`Puerto no válido: ${port ?? ""}.`, `Invalid port: ${port ?? ""}.`),
        t(
          "usa `--port` con un número de 1 a 65535.",
          "use `--port` with a number from 1 to 65535.",
        ),
      ),
      status: "invalid",
    };
  }
  // Only the person decides from the UI: an agent that starts the server would see the link.
  const actions = session.environment.terminal.interactive;
  const server = await startServer({ session, port: first, ui: await uiFolder(), actions });
  const opened: Output = {
    status: "ok",
    header: headerOf("ui"),
    blocks: section(undefined, [
      t(
        `Los cambios de todas las worktrees, en ${server.link}`,
        `The changes of every worktree, at ${server.link}`,
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
  session.environment.io.out(renderText(opened, session.lang));
  await stop;
  await server.close();
  return {
    status: "ok",
    header: headerOf("ui"),
    blocks: section(undefined, [t("Servidor cerrado.", "Server stopped.")]),
    next: t(`ábrelo otra vez con \`${COMMAND} ui\`.`, `open it again with \`${COMMAND} ui\`.`),
  };
}
