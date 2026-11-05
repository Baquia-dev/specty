// SPDX-License-Identifier: Apache-2.0
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Output } from "@baquia-dev/specty-core";
import { restore } from "../commands/restore";
import { openChanges } from "../commands/status";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { readMemory } from "../store/memory";
import {
  delegationView,
  memoryAction,
  parseAction,
  parseMemoryAction,
  runAction,
  setDelegation,
} from "./actions";
import { type Context, hasSession, isLocal, JSON_TYPE, same, send, TEXT } from "./context";
import { changeDiff, type DiffAnswer } from "./diff";
import { finishedPage } from "./finished";
import { changeRecord, openRecords } from "./records";
import { sessionsView } from "./sessions";
import { epicSliceChanges } from "./slices";
import { changeTrace, traceReply } from "./trace";

/** A read of the API: from this origin and with the session. */
export async function readApi(
  request: IncomingMessage,
  response: ServerResponse,
  context: Context,
  url: URL,
) {
  const origin = request.headers.origin;
  const foreign = origin !== undefined && !isLocal(origin.replace(/^http:\/\//, ""), context.port);
  if (foreign || !hasSession(request.headers.cookie, context))
    return send(response, 403, JSON_TYPE, '{"error":"forbidden"}');
  const view = VIEWS.get(url.pathname);
  const answer = view === undefined ? undefined : await view(context.session, url.searchParams);
  if (answer !== undefined) return send(response, 200, JSON_TYPE, JSON.stringify(answer));
  if (url.pathname === "/api/events") return context.events.add(response);
  if (url.pathname === "/api/session") {
    const actions = context.actions === true;
    return send(
      response,
      200,
      JSON_TYPE,
      JSON.stringify(actions ? { actions, csrf: context.csrf } : { actions }),
    );
  }
  const one = /^\/api\/changes\/([^/]+)$/.exec(url.pathname)?.[1];
  if (one !== undefined) return readRecord(response, context, one);
  return readChange(response, context, url);
}

/** A read that looks at the session and the URL's parameters, and what it answers, as JSON. */
type View = (session: Session, params: URLSearchParams) => Promise<unknown>;

/** The reads that need nothing else: each path and its view. */
const VIEWS: ReadonlyMap<string, View> = new Map<string, View>([
  ["/api/changes", openRecords],
  ["/api/changes/finished", finishedPage],
  ["/api/delegation", delegationView],
  ["/api/memory", memoryView],
  ["/api/sessions", sessionsView],
]);

/**
 * `GET /api/memory` (ADR 0016): every entry of Specty's memory, and the open changes of every
 * worktree as `specty status` sees them, with who holds each one and whether it is an orphan.
 */
async function memoryView(session: Session) {
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  return { entries, changes: await openChanges(session) };
}

/** A change by its id, open or archived, as `changeRecords` gives it; 404 when there is none. */
async function readRecord(response: ServerResponse, context: Context, id: string) {
  const record = await changeRecord(context.session, decodeURIComponent(id));
  return record === undefined
    ? send(response, 404, JSON_TYPE, '{"error":"not found"}')
    : send(response, 200, JSON_TYPE, JSON.stringify(record));
}

/** A read of one part of the change `id`, with the URL for its parameters. */
type ChangePart = (
  response: ServerResponse,
  context: Context,
  id: string,
  url: URL,
) => Promise<void>;

/**
 * The parts of a change that can be read: its diff, whole or of one task; its verification going
 * on; its traceability; and, if it is an epic, the change of each of its slices.
 */
const PARTS: ReadonlyMap<string, ChangePart> = new Map<string, ChangePart>([
  [
    "diff",
    async (response, context, id, url) => {
      const task = url.searchParams.get("task") ?? undefined;
      sendDiff(response, await changeDiff(context.session, id, task));
    },
  ],
  [
    "run",
    async (response, context, id) => {
      const run = context.runs.current(id) ?? null;
      send(response, 200, JSON_TYPE, JSON.stringify(run));
    },
  ],
  [
    "trace",
    async (response, context, id, url) => {
      const path = url.searchParams.get("path") ?? undefined;
      const reply = traceReply(await changeTrace(context.session, id, path));
      send(response, reply.status, JSON_TYPE, reply.body);
    },
  ],
  [
    "slices",
    async (response, context, id) => {
      const slices = await epicSliceChanges(context.session, id);
      if (slices === undefined) send(response, 404, JSON_TYPE, '{"error":"not found"}');
      else send(response, 200, JSON_TYPE, JSON.stringify(slices));
    },
  ],
]);

/** A part of a change, by its name in the URL; 404 for any other path. */
async function readChange(response: ServerResponse, context: Context, url: URL) {
  const [, id, name] = /^\/api\/changes\/([^/]+)\/([^/]+)$/.exec(url.pathname) ?? [];
  const part = name === undefined ? undefined : PARTS.get(name);
  if (id === undefined || part === undefined)
    return send(response, 404, JSON_TYPE, '{"error":"not found"}');
  return part(response, context, decodeURIComponent(id), url);
}

/** A diff as text; without one, why: 404 no commits, 413 too large (with its range), 500 git. */
function sendDiff(response: ServerResponse, answer: DiffAnswer) {
  if (answer.kind === "diff") return send(response, 200, TEXT, answer.text);
  if (answer.kind === "missing") return send(response, 404, JSON_TYPE, '{"error":"not found"}');
  if (answer.kind === "too-large")
    return send(
      response,
      413,
      JSON_TYPE,
      JSON.stringify({ error: "too large", range: answer.range }),
    );
  return send(response, 500, JSON_TYPE, '{"error":"git"}');
}

/**
 * An action of the person: from this origin, with the session and, when the person started the
 * server, with its CSRF token. The answer is the command's output: 200 done, 409 refused.
 */
export async function act(
  request: IncomingMessage,
  response: ServerResponse,
  context: Context,
  pathname: string,
) {
  const refused = actionRefusal(request, context);
  if (refused !== undefined) return send(response, 403, JSON_TYPE, refused);
  const body = await readBody(request);
  const bad = () => send(response, 400, JSON_TYPE, '{"error":"bad request"}');
  const done = (output: Output) =>
    send(response, output.status === "ok" ? 200 : 409, JSON_TYPE, JSON.stringify(output));
  if (pathname === "/api/delegation") {
    const on = isRecord(body) ? body.on : undefined;
    if (typeof on !== "boolean") return bad();
    return done(await context.serial(() => setDelegation(context.session, on)));
  }
  const memory = parseMemoryAction(pathname, body);
  if (memory === "bad") return bad();
  if (memory !== undefined)
    return done(await context.serial(() => memoryAction(context.session, memory)));
  const verify = /^\/api\/changes\/([^/]+)\/verify$/.exec(pathname)?.[1];
  // Outside the queue: it takes minutes and changes no state, so the other actions go on.
  if (verify !== undefined) return done(await context.runs.start(decodeURIComponent(verify)));
  // A lost folder has no change folder to act in: `restore` finds the change from its branch.
  const lost = /^\/api\/changes\/([^/]+)\/restore$/.exec(pathname)?.[1];
  if (lost !== undefined) {
    const id = decodeURIComponent(lost);
    return done(await context.serial(() => restore(context.session, id)));
  }
  const parsed = parseAction(
    pathname.split("/").filter((part) => part !== ""),
    body,
  );
  if (parsed === undefined) return bad();
  return done(await context.serial(() => runAction(context.session, parsed.id, parsed.action)));
}

/**
 * Why an action is refused, as the body of its 403: from another origin or without the session,
 * on a read-only server, or without the CSRF token.
 */
function actionRefusal(request: IncomingMessage, context: Context): string | undefined {
  const origin = request.headers.origin;
  const here = origin !== undefined && isLocal(origin.replace(/^http:\/\//, ""), context.port);
  if (!here || !hasSession(request.headers.cookie, context)) return '{"error":"forbidden"}';
  if (context.actions !== true) return '{"error":"read-only"}';
  const csrf = request.headers["x-specty-csrf"];
  if (typeof csrf !== "string" || !same(csrf, context.csrf)) return '{"error":"forbidden"}';
  return undefined;
}

/** A JSON body of at most 64 KiB; anything else reads as nothing. */
async function readBody(request: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += part.length;
    if (size > 65_536) return undefined;
    parts.push(part);
  }
  return parseJson(Buffer.concat(parts).toString("utf8"));
}
