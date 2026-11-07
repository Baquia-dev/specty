// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { notBuiltPage } from "@baquia-dev/specty-core";
import { act, readApi } from "./api";
import {
  type Context,
  isLocal,
  JSON_TYPE,
  SAFE,
  type ServerOptions,
  same,
  send,
  TEXT,
} from "./context";
import { changeEvents } from "./events";
import { changeRuns } from "./runs";

export interface UiServer {
  readonly port: number;
  /** The link to open: it carries the session token, which the server trades for a cookie. */
  readonly link: string;
  close(): Promise<void>;
}

const HTML = "text/html; charset=utf-8";
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
/** Tells the UI it runs on this server, not on its sample data. */
const MARKER = '<meta name="specty-data" content="server" />';

/** Starts the local server on `127.0.0.1` (ARCHITECTURE §15). */
export async function startServer(options: ServerOptions): Promise<UiServer> {
  const server = createServer();
  const port = await listen(
    server,
    options.port,
    options.session.config.internal.server.portsTried,
  );
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const { changesEveryMs } = options.session.config.internal.server;
  const events = changeEvents(options.session, options.interval ?? changesEveryMs, SAFE);
  const ui = options.ui === undefined ? undefined : resolve(options.ui);
  let last: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = last.then(task, task);
    last = run.catch(() => undefined);
    return run;
  };
  const cookie = `specty-${port}`;
  // A full verification that merges main changes the change: it goes in the actions' queue.
  const runs = changeRuns(
    options.session,
    (change, run) => events.send("run", { change, run: run ?? null }),
    serial,
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

/** Listens on the first free port of `tried` from `first`, up to 65535; 0, any free one. */
async function listen(server: Server, first: number, tried: number): Promise<number> {
  const last = first === 0 ? 0 : Math.min(first + tried - 1, 65_535);
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
  // The server keeps one `Git` for hours: what it recalls from before this request may be old.
  context.session.git.forget();
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "POST" && url.pathname.startsWith("/api/"))
    return act(request, response, context, url.pathname);
  if (request.method !== "GET") return send(response, 405, TEXT, "specty: method");
  const token = url.searchParams.get("token");
  if (token !== null) return signIn(response, context, token);
  if (url.pathname.startsWith("/api/")) return readApi(request, response, context, url);
  return serveUi(response, context, url.pathname);
}

/** The link with the server's token: it sets the session's cookie and goes to the UI. */
function signIn(response: ServerResponse, context: Context, token: string) {
  if (!same(token, context.token)) return send(response, 403, TEXT, "specty: link");
  response.writeHead(303, {
    ...SAFE,
    Location: "/",
    "Set-Cookie": `${context.cookie}=${context.token}; HttpOnly; SameSite=Strict; Path=/`,
  });
  return response.end();
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
