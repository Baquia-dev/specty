// SPDX-License-Identifier: Apache-2.0
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { translator } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { type ChangeEvents, changeEvents } from "./events";
import { changeRecords } from "./records";

export interface ServerOptions {
  readonly session: Session;
  /** The first port to try, and up to 19 after it; 0 lets the system choose. */
  readonly port: number;
  /** The folder of the built UI; without one, a page explains how to build it. */
  readonly ui: string | undefined;
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
  readonly events: ChangeEvents;
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

/** Starts the local server on `127.0.0.1` (ARCHITECTURE §15); for now it only reads. */
export async function startServer(options: ServerOptions): Promise<UiServer> {
  const server = createServer();
  const port = await listen(server, options.port);
  const token = randomBytes(32).toString("base64url");
  const events = changeEvents(options.session, options.interval ?? 1000, SAFE);
  const ui = options.ui === undefined ? undefined : resolve(options.ui);
  const context: Context = { ...options, ui, port, token, cookie: `specty-${port}`, events };
  server.on("request", (request: IncomingMessage, response: ServerResponse) => {
    handle(request, response, context).catch(() => send(response, 500, TEXT, "specty: error"));
  });
  return {
    port,
    link: `http://localhost:${port}/?token=${token}`,
    close: () => {
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
  if (request.method !== "GET") return send(response, 405, TEXT, "specty: read only");
  const url = new URL(request.url ?? "/", "http://localhost");
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
    return send(response, 404, JSON_TYPE, '{"error":"not found"}');
  }
  return serveUi(response, context, url.pathname);
}

/** The built UI's files; app routes, and `index.html` itself, get the marked `index.html`. */
async function serveUi(response: ServerResponse, context: Context, pathname: string) {
  const { ui } = context;
  if (ui === undefined) return send(response, 200, HTML, notBuilt(context.session));
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
    ? send(response, 200, HTML, notBuilt(context.session))
    : send(response, 200, HTML, html.replace("</head>", `${MARKER}</head>`));
}

function notBuilt(session: Session): string {
  const t = translator(session.lang);
  return `<!doctype html><meta charset="utf-8"><title>Specty</title><p>${t(
    "La UI no está construida: ejecuta <code>pnpm --filter @baquia-dev/specty-ui build</code> y vuelve a cargar esta página. Los datos siguen en <code>/api/changes</code>.",
    "The UI is not built: run <code>pnpm --filter @baquia-dev/specty-ui build</code> and reload this page. The data is still at <code>/api/changes</code>.",
  )}</p>`;
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
