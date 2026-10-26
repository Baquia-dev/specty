// SPDX-License-Identifier: Apache-2.0
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  invalidPortCard,
  type Output,
  renderText,
  uiOpenedCard,
  uiStoppedCard,
} from "@baquia-dev/specty-core";
import { exists } from "../io/files";
import { startServer } from "../server/http";
import type { Session } from "../session";

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
  const first = port === undefined ? DEFAULT_PORT : Number(port);
  if (!Number.isInteger(first) || first < 0 || first > 65_535) {
    return invalidPortCard(port ?? "", session.cards);
  }
  // Only the person decides from the UI: an agent that starts the server would see the link.
  const actions = session.environment.terminal.interactive;
  const server = await startServer({ session, port: first, ui: await uiFolder(), actions });
  const opened = uiOpenedCard(server.link, actions, session.cards);
  session.environment.io.out(renderText(opened, session.lang));
  await stop;
  await server.close();
  return uiStoppedCard(session.cards);
}
