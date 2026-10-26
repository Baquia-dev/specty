// SPDX-License-Identifier: Apache-2.0
// Helpers of the local server's tests: sessions, requests as the browser makes them, and a
// change in review served by its person.
import { type IncomingHttpHeaders, request } from "node:http";
import { expect } from "vitest";
import { startServer, type UiServer } from "../../src/server/http";
import { openSession, type Session, type Terminal } from "../../src/session";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  NOW,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "../support";

/** A session in `cwd`, as the commands open it; what it prints goes to `out`. */
export async function sessionAt(
  cwd: string,
  terminal: Terminal,
  out = (_: string) => undefined,
): Promise<Session> {
  const opened = await openSession({
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal,
    io: { out, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error(`no Specty session in ${cwd}`);
  return opened.session;
}

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/** A request as the browser makes it: from 127.0.0.1, with `headers` and an optional JSON body. */
export function call(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return new Promise<Answer>((done, fail) => {
    const sent = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: body === undefined ? "GET" : "POST",
        headers: { host: `127.0.0.1:${port}`, "content-type": "application/json", ...headers },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.on("end", () =>
          done({ status: response.statusCode ?? 0, headers: response.headers, body: text }),
        );
      },
    );
    sent.on("error", fail);
    sent.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** Opens the server's link and reads its session: the headers every action needs. */
async function enter(server: UiServer) {
  const { pathname, search } = new URL(server.link);
  const cookie = (await call(server.port, `${pathname}${search}`)).headers["set-cookie"]?.[0];
  const headers = {
    cookie: cookie?.split(";")[0] ?? "",
    origin: `http://localhost:${server.port}`,
  };
  const session = JSON.parse((await call(server.port, "/api/session", headers)).body);
  return { session, headers: { ...headers, "x-specty-csrf": session.csrf ?? "" } };
}

/** SPEC's change in review, and a server the person started there (or the agent: read only). */
export async function serving(actions = true, config = CONFIG()) {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const server = await startServer({
    session: await sessionAt(root, AGENT),
    port: 0,
    ui: undefined,
    actions,
  });
  return { root, server, ...(await enter(server)) };
}

/** SPEC's change, approved, with its tasks done in order: each leaves `src/app.ts` as given. */
export async function implemented(root: string, ...contents: readonly string[]) {
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  for (const [index, content] of contents.entries()) {
    await writeFiles(root, { "src/app.ts": content });
    const done = await cli(root, ["task", "done", `T${index + 1}`, "--summary", "Hecho"]);
    expect(done.code).toBe(0);
  }
}

/** An event of `/api/events`: its name and its data as sent. */
export interface Heard {
  readonly name: string;
  readonly data: string;
}

/** Listens to `/api/events` as the browser does: every event heard, and a wait for one. */
export function listen(port: number, headers: Readonly<Record<string, string>>) {
  const heard: Heard[] = [];
  const waiting: { readonly test: (event: Heard) => boolean; readonly done: () => void }[] = [];
  let rest = "";
  const sent = request(
    {
      host: "127.0.0.1",
      port,
      path: "/api/events",
      headers: { host: `127.0.0.1:${port}`, ...headers },
    },
    (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        const blocks = `${rest}${chunk}`.split("\n\n");
        rest = blocks.pop() ?? "";
        for (const block of blocks) {
          const event = {
            name: /^event: (.*)$/m.exec(block)?.[1] ?? "",
            data: /^data: (.*)$/m.exec(block)?.[1] ?? "",
          };
          heard.push(event);
          for (const wait of waiting.filter(({ test }) => test(event))) wait.done();
        }
      });
    },
  );
  sent.on("error", () => undefined);
  sent.end();
  return {
    heard,
    until: (test: (event: Heard) => boolean) =>
      heard.some(test)
        ? Promise.resolve()
        : new Promise<void>((done) => {
            waiting.push({ test, done });
          }),
    close: () => sent.destroy(),
  };
}

export const state = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
export const path = (verb: string) => `/api/changes/${CHANGE}/${verb}`;
