// SPDX-License-Identifier: Apache-2.0
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { notBuiltPage, type Output } from "@baquia-dev/specty-core";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { delegationView, parseAction, runAction, setDelegation } from "./actions";
import { changeDiff, type DiffAnswer } from "./diff";
import { type ChangeEvents, changeEvents } from "./events";
import { changeRecords } from "./records";
import { changeRuns, type Runs } from "./runs";

export interface ServerOptions {
  readonly session: Session;
  /** The first port to try, and up to 19 after it; 0 lets the system choose. */
  readonly port: number;
  /** The folder of the built UI; without one, a page explains how to build it. */
  readonly ui: string | undefined;
  /**
   * The person may decide from the UI: only when they started the server themselves, since an
   * agent that starts it sees the link.
   */
  readonly actions?: boolean;
  /** Milliseconds between looks at the changes while someone listens to the events. */
  readonly interval?: number;
}

export interface UiServer {
  readonly port: number;
  /** The link to open: it carries the session token, which the server trades for a cookie. */
  readonly link: string;
  close(): Promise<void>;
}

interface Context extends ServerOptions {
  readonly port: number;
  readonly token: string;
  /** Cookies of `localhost` reach every port: the name carries this one. */
  readonly cookie: string;
  /** Every action carries it in `X-Specty-CSRF`; `GET /api/session` gives it to the page. */
  readonly csrf: string;
  readonly events: ChangeEvents;
  /** Runs the actions one at a time: the commands were not written to overlap. */
  readonly serial: <T>(task: () => Promise<T>) => Promise<T>;
  readonly runs: Runs;
}

const TEXT = "text/plain; charset=utf-8";
const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const TYPES: Readonly<Record<string, string>> = {
  ".html": HTML,
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": JSON_TYPE,
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": TEXT,
};
/** Sent with every answer: no sniffing, no referrer with the link, no frames, no caching. */
const SAFE = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};
/** Tells the UI it runs on this server, not on its sample data. */
const MARKER = '<meta name="specty-data" content="server" />';

/** Starts the local server on `127.0.0.1` (ARCHITECTURE §15). */
export async function startServer(options: ServerOptions): Promise<UiServer> {
  const server = createServer();
  const port = await listen(server, options.port);
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const events = changeEvents(options.session, options.interval ?? 1000, SAFE);
  const ui = options.ui === undefined ? undefined : resolve(options.ui);
  let last: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = last.then(task, task);
    last = run.catch(() => undefined);
    return run;
  };
  const cookie = `specty-${port}`;
  const runs = changeRuns(options.session, (change, run) =>
    events.send("run", { change, run: run ?? null }),
  );
  const context: Context = { ...options, ui, port, token, cookie, csrf, events, serial, runs };
  server.on("request", (request: IncomingMessage, response: ServerResponse) => {
    handle(request, response, context).catch(() => send(response, 500, TEXT, "specty: error"));
  });
  return {
    port,
    link: `http://localhost:${port}/?token=${token}`,
    close: () => {
      runs.close();
      events.close();
      server.closeAllConnections();
      return new Promise((done) => server.close(() => done()));
    },
  };
}

async function listen(server: Server, first: number): Promise<number> {
  const last = first === 0 ? 0 : first + 19;
  for (let port = first; port <= last; port++) {
    const bound = await new Promise<number | undefined>((done) => {
      const busy = () => done(undefined);
      server.once("error", busy);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", busy);
        const address = server.address();
        done(typeof address === "object" && address !== null ? address.port : undefined);
      });
    });
    if (bound !== undefined) return bound;
  }
  throw new Error(`no free port from ${first} to ${last}`);
}

async function handle(request: IncomingMessage, response: ServerResponse, context: Context) {
  // Another host name means DNS rebinding: a page elsewhere pointing its name at this server.
  if (!isLocal(request.headers.host, context.port))
    return send(response, 403, TEXT, "specty: host");
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "POST" && url.pathname.startsWith("/api/"))
    return act(request, response, context, url.pathname);
  if (request.method !== "GET") return send(response, 405, TEXT, "specty: method");
  const token = url.searchParams.get("token");
  if (token !== null) {
    if (!same(token, context.token)) return send(response, 403, TEXT, "specty: link");
    response.writeHead(303, {
      ...SAFE,
      Location: "/",
      "Set-Cookie": `${context.cookie}=${context.token}; HttpOnly; SameSite=Strict; Path=/`,
    });
    return response.end();
  }
  if (url.pathname.startsWith("/api/")) {
    const origin = request.headers.origin;
    const foreign =
      origin !== undefined && !isLocal(origin.replace(/^http:\/\//, ""), context.port);
    if (foreign || !hasSession(request.headers.cookie, context))
      return send(response, 403, JSON_TYPE, '{"error":"forbidden"}');
    if (url.pathname === "/api/changes")
      return send(response, 200, JSON_TYPE, JSON.stringify(await changeRecords(context.session)));
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
    if (url.pathname === "/api/delegation") {
      const view = await delegationView(context.session);
      return send(response, 200, JSON_TYPE, JSON.stringify(view));
    }
    const [, id, part] = /^\/api\/changes\/([^/]+)\/(diff|run)$/.exec(url.pathname) ?? [];
    if (id !== undefined && part === "run") {
      const run = context.runs.current(decodeURIComponent(id)) ?? null;
      return send(response, 200, JSON_TYPE, JSON.stringify(run));
    }
    if (id !== undefined) {
      const task = url.searchParams.get("task") ?? undefined;
      return sendDiff(response, await changeDiff(context.session, decodeURIComponent(id), task));
    }
    return send(response, 404, JSON_TYPE, '{"error":"not found"}');
  }
  return serveUi(response, context, url.pathname);
}

/**
 * An action of the person: from this origin, with the session and, when the person started the
 * server, with its CSRF token. The answer is the command's output: 200 done, 409 refused.
 */
async function act(
  request: IncomingMessage,
  response: ServerResponse,
  context: Context,
  pathname: string,
) {
  const origin = request.headers.origin;
  const here = origin !== undefined && isLocal(origin.replace(/^http:\/\//, ""), context.port);
  if (!here || !hasSession(request.headers.cookie, context))
    return send(response, 403, JSON_TYPE, '{"error":"forbidden"}');
  if (context.actions !== true) return send(response, 403, JSON_TYPE, '{"error":"read-only"}');
  const csrf = request.headers["x-specty-csrf"];
  if (typeof csrf !== "string" || !same(csrf, context.csrf))
    return send(response, 403, JSON_TYPE, '{"error":"forbidden"}');
  const body = await readBody(request);
  const bad = () => send(response, 400, JSON_TYPE, '{"error":"bad request"}');
  const done = (output: Output) =>
    send(response, output.status === "ok" ? 200 : 409, JSON_TYPE, JSON.stringify(output));
  if (pathname === "/api/delegation") {
    const on = isRecord(body) ? body.on : undefined;
    if (typeof on !== "boolean") return bad();
    return done(await context.serial(() => setDelegation(context.session, on)));
  }
  const verify = /^\/api\/changes\/([^/]+)\/verify$/.exec(pathname)?.[1];
  // Outside the queue: it takes minutes and changes no state, so the other actions go on.
  if (verify !== undefined) return done(await context.runs.start(decodeURIComponent(verify)));
  const parsed = parseAction(
    pathname.split("/").filter((part) => part !== ""),
    body,
  );
  if (parsed === undefined) return bad();
  return done(await context.serial(() => runAction(context.session, parsed.id, parsed.action)));
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

/** The built UI's files; app routes, and `index.html` itself, get the marked `index.html`. */
async function serveUi(response: ServerResponse, context: Context, pathname: string) {
  const { ui } = context;
  if (ui === undefined) return send(response, 200, HTML, notBuiltPage(context.session.lang));
  const file = resolve(ui, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(`${ui}${sep}`) && file !== ui)
    return send(response, 404, TEXT, "specty: not found");
  const index = join(ui, "index.html");
  if (extname(file) !== "" && file !== index) {
    const content = await readFile(file).catch(() => undefined);
    return content === undefined
      ? send(response, 404, TEXT, "specty: not found")
      : send(response, 200, TYPES[extname(file)] ?? "application/octet-stream", content);
  }
  const html = await readFile(index, "utf8").catch(() => undefined);
  return html === undefined
    ? send(response, 200, HTML, notBuiltPage(context.session.lang))
    : send(response, 200, HTML, html.replace("</head>", `${MARKER}</head>`));
}

function isLocal(host: string | undefined, port: number): boolean {
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}

function hasSession(cookies: string | undefined, context: Context): boolean {
  const value = (cookies ?? "")
    .split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === context.cookie)?.[1];
  return value !== undefined && same(value, context.token);
}

function same(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer) {
  response.writeHead(status, { ...SAFE, "Content-Type": type });
  response.end(body);
}
