// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveActive } from "../flow/active";
import { isRecord, readText } from "../io/files";
import { changeRecords } from "../server/records";
import { type Environment, openSession } from "../session";

/**
 * The MCP App of `specty mcp` (ADR 0015): with a client that renders MCP Apps, a change's tools
 * show the UI in the chat. The page is the UI's build in one HTML, next to the bundle; its data
 * comes from `specty_view`, a tool only the app can call, which only reads.
 */

/** The extension of MCP Apps, and the kind of page it renders. */
const EXTENSION = "io.modelcontextprotocol/ui";
export const VIEW_MIME = "text/html;profile=mcp-app";
/** The one view: the change a tool worked on. */
export const VIEW_URI = "ui://specty/change";

/** Whether the client declares in `initialize` that it renders MCP Apps' HTML pages. */
export function rendersApps(params: Readonly<Record<string, unknown>>): boolean {
  const { capabilities } = params;
  const extensions = isRecord(capabilities) ? capabilities.extensions : undefined;
  const apps = isRecord(extensions) ? extensions[EXTENSION] : undefined;
  const types = isRecord(apps) ? apps.mimeTypes : undefined;
  return Array.isArray(types) && types.includes(VIEW_MIME);
}

/**
 * The page the build writes next to the bundle, if it wrote one: beside `script` when the
 * invocation names it, as in the tests; otherwise beside this module, which is in the bundle.
 */
export function viewPage(script: string | undefined): Promise<string | undefined> {
  const folder = script === undefined ? dirname(fileURLToPath(import.meta.url)) : dirname(script);
  return readText(join(folder, "mcp-app.html"));
}

/** What `specty_view` gives: the record of the change open in `folder`, as `/api/changes` would. */
export async function viewData(
  environment: Environment,
  folder: string,
): Promise<{ readonly records: readonly unknown[] }> {
  const opened = await openSession({ ...environment, cwd: folder });
  if (opened.kind !== "ok") return { records: [] };
  const active = await resolveActive(opened.session);
  if (active === undefined) return { records: [] };
  const records = await changeRecords(opened.session);
  return { records: records.filter((record) => record.state.id === active.state.id) };
}
