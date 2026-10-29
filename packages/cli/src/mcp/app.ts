// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveActive } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { isRecord, readText } from "../io/files";
import { changeRecords } from "../server/records";
import { type Environment, openSession, type Session } from "../session";
import { loadChange } from "../store/changes";
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
 * What `specty_view` gives: the record of a change, as `/api/changes` would, its verification
 * going on and its fingerprint; or only that nothing changed, if the view already has what
 * `since` names.
 */
type ViewData =
  | { readonly fingerprint: string; readonly unchanged: true }
  | {
      readonly fingerprint: string;
      readonly records: readonly unknown[];
      readonly run?: ViewRun;
    };

/** What the view asks for: the folder of the tool's call, what it has and the change it shows. */
export interface ViewAsk {
  readonly folder: string;
  readonly since: string | undefined;
  readonly change: string | undefined;
}

const NOTHING: ViewData = { fingerprint: "", records: [] };

/** The change open in the folder asked, or the one the view names, wherever it lives. */
export async function viewData(environment: Environment, asked: ViewAsk): Promise<ViewData> {
  const session = await sessionFor(environment, asked);
  const found = session === undefined ? undefined : await changeOf(session, asked.change);
  if (session === undefined || found === undefined) return NOTHING;
  const { id } = found.state;
  const run = await runOf(session, id);
  const fingerprint = await fingerprintOf(found.files.dir, run);
  if (fingerprint === asked.since) return { fingerprint, unchanged: true };
  const records = await changeRecords(session);
  return {
    fingerprint,
    records: records.filter((record) => record.state.id === id),
    ...(run === undefined ? {} : { run }),
  };
}

/**
 * A session in the folder asked. For a change named by its id, in the server's folder when that
 * one is gone, as the worktree of a change that closed.
 */
async function sessionFor(environment: Environment, asked: ViewAsk): Promise<Session | undefined> {
  const opened = await openSession({ ...environment, cwd: asked.folder });
  if (opened.kind === "ok") return opened.session;
  if (asked.change === undefined) return undefined;
  const here = await openSession(environment);
  return here.kind === "ok" ? here.session : undefined;
}

/** The change open in the session's folder or, by its id, open in any worktree or archived. */
async function changeOf(session: Session, id: string | undefined) {
  if (id === undefined) return resolveActive(session);
  const located = (await locateChanges(session)).find(({ change }) => change.state.id === id);
  return located?.change ?? loadChange(session.paths, id);
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
