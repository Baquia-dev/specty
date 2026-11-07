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
import { openInBrowser } from "../io/browser";
import { exists } from "../io/files";
import { startServer } from "../server/http";
import type { Session } from "../session";

const DEFAULT_PORT = 4173;

export interface UiOptions {
  readonly port?: string;
  readonly open?: boolean;
}

/** The port of `--port` or, without it, that of `ui.port` (4173 with `auto`); undefined if invalid. */
function parsePort(
  options: UiOptions | string | undefined,
  configured: Session["config"]["ui"]["port"],
): number | undefined {
  const port = typeof options === "string" ? options : options?.port;
  if (port === undefined) return configured === "auto" ? DEFAULT_PORT : configured;
  const num = Number(port);
  return Number.isInteger(num) && num >= 0 && num <= 65_535 ? num : undefined;
}

function rawPort(options?: UiOptions | string): string {
  return (typeof options === "string" ? options : options?.port) ?? "";
}

function shouldOpen(options?: UiOptions | string, interactive?: boolean): boolean {
  return interactive === true && (typeof options === "string" || options?.open !== false);
}

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
  options?: UiOptions | string,
  stop: Promise<void> = stopRequested(),
  openUrl: (url: string) => void = openInBrowser,
): Promise<Output> {
  const port = parsePort(options, session.config.ui.port);
  if (port === undefined) {
    return invalidPortCard(rawPort(options), session.cards);
  }
  // Only the person decides from the UI: an agent that starts the server would see the link.
  const actions = session.environment.terminal.interactive;
  const server = await startServer({ session, port, ui: await uiFolder(), actions });
  const opened = uiOpenedCard(server.link, actions, session.cards);
  session.environment.io.out(renderText(opened, session.lang));
  if (shouldOpen(options, actions)) {
    openUrl(server.link);
  }
  await stop;
  await server.close();
  return uiStoppedCard(session.cards);
}
