// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveActive } from "../flow/active";
import { isRecord, readText } from "../io/files";
import { changeRecords } from "../server/records";
import { type Environment, openSession, type Session } from "../session";
import { alive } from "../store/lock";
import { type LiveRun, readRuns } from "../store/runs";

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

/** The files of a change whose size and time say whether it moved. */
const WATCHED: readonly string[] = ["spec.md", "state.json", "audit.jsonl", "comments.json"];

/** The verification going on, as the view shows it: without the process that runs it. */
type ViewRun = Omit<LiveRun, "pid">;

/**
 * What `specty_view` gives: the record of the change open in a folder, as `/api/changes` would,
 * its verification going on and its fingerprint; or only that nothing changed, if the view
 * already has what `since` names.
 */
type ViewData =
  | { readonly fingerprint: string; readonly unchanged: true }
  | {
      readonly fingerprint: string;
      readonly records: readonly unknown[];
      readonly run?: ViewRun;
    };

export async function viewData(
  environment: Environment,
  folder: string,
  since: string | undefined,
): Promise<ViewData> {
  const opened = await openSession({ ...environment, cwd: folder });
  if (opened.kind !== "ok") return { fingerprint: "", records: [] };
  const { session } = opened;
  const active = await resolveActive(session);
  if (active === undefined) return { fingerprint: "", records: [] };
  const run = await runOf(session, active.state.id);
  const fingerprint = await fingerprintOf(active.files.dir, run);
  if (fingerprint === since) return { fingerprint, unchanged: true };
  const records = await changeRecords(session);
  return {
    fingerprint,
    records: records.filter((record) => record.state.id === active.state.id),
    ...(run === undefined ? {} : { run }),
  };
}

/** The verification of change `id` that a live process is running, if any. */
async function runOf(session: Session, id: string): Promise<ViewRun | undefined> {
  const live = (await readRuns(session.git)).get(id);
  if (live === undefined || !alive(live.pid)) return undefined;
  const { pid: _pid, ...run } = live;
  return run;
}

/** A hash of the size and time of the change's files, and of its run: it moves with the change. */
async function fingerprintOf(dir: string, run: ViewRun | undefined): Promise<string> {
  const files = await Promise.all(
    WATCHED.map((name) =>
      stat(join(dir, name)).then(
        ({ size, mtimeMs }) => `${name}:${size}:${mtimeMs}`,
        () => `${name}:-`,
      ),
    ),
  );
  const hash = createHash("sha256").update(files.join("\n"));
  if (run !== undefined) hash.update(JSON.stringify(run));
  return hash.digest("hex").slice(0, 16);
}
