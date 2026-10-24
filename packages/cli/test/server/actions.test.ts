// SPDX-License-Identifier: Apache-2.0
import { type IncomingHttpHeaders, request } from "node:http";
import { describe, expect, it } from "vitest";
import { ui } from "../../src/commands/ui";
import { startServer, type UiServer } from "../../src/server/http";
import { openSession, type Session, type Terminal } from "../../src/session";
import {
  AGENT,
  APP,
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  git,
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
async function sessionAt(
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
function call(port: number, path: string, headers: Record<string, string> = {}, body?: unknown) {
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
async function serving(actions = true, config = CONFIG()) {
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

const STATE = `.specty/changes/${CHANGE}/state.json`;
const state = async (root: string) => JSON.parse(await read(root, STATE));
const path = (verb: string) => `/api/changes/${CHANGE}/${verb}`;

describe("the person's actions in the local server", () => {
  it("are there only when the person started the server (AC1)", async () => {
    const { server, session, headers } = await serving();
    expect(session).toEqual({ actions: true, csrf: expect.any(String) });
    await server.close();
    const readOnly = await serving(false);
    expect(readOnly.session).toEqual({ actions: false });
    const refused = await call(readOnly.server.port, path("approve"), readOnly.headers, {
      revision: 1,
    });
    expect([refused.status, refused.body]).toEqual([403, '{"error":"read-only"}']);
    await readOnly.server.close();
    expect(headers.cookie).toMatch(/^specty-\d+=/);
  });

  it("approve the revision the person saw, once its assumptions are confirmed (AC2, AC3)", async () => {
    const { root, server, headers } = await serving();
    try {
      const early = await call(server.port, path("approve"), headers, { revision: 1 });
      expect(early.status).toBe(409);
      expect(early.body).toContain("Faltan por confirmar supuestos de alto impacto: A1.");
      const decided = await call(server.port, path("assumptions/A1"), headers, {
        decision: "confirmed",
      });
      expect(decided.status).toBe(200);
      const stale = await call(server.port, path("approve"), headers, { revision: 2 });
      expect([stale.status, stale.body.includes("La revisión vigente es la 1, no la 2.")]).toEqual([
        409,
        true,
      ]);
      expect((await call(server.port, path("approve"), headers, { revision: 1 })).status).toBe(200);
      expect(await state(root)).toMatchObject({
        phase: "implementing",
        approved: { channel: "ui" },
      });
      expect(git(root, "log", "-1", "--format=%s")).toBe("docs(spec): Saludo personalizado");
    } finally {
      await server.close();
    }
  });

  it("decide scope, accept and close like the terminal, in the change's folder (AC4)", async () => {
    const { root, server, headers } = await serving();
    try {
      await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      await cli(root, ["next"]);
      await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
      const scope = await call(server.port, path("scope/S1"), headers, { decision: "approved" });
      expect(scope.status).toBe(200);
      expect((await state(root)).tasks.T1.scopeExtra).toEqual(["lib/other.ts"]);
      for (const [task, text] of [
        ["T1", "1\n"],
        ["T2", "2\n"],
      ] as const) {
        await writeFiles(root, { "src/app.ts": text });
        await cli(root, ["task", "done", task, "--summary", task]);
      }
      expect((await call(server.port, path("accept"), headers, {})).status).toBe(200);
      expect((await state(root)).phase).toBe("closing");
      const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
      await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
      await cli(root, ["propose"]);
      expect((await call(server.port, path("close"), headers, {})).status).toBe(200);
      expect(await read(root, `${ARCHIVE}/${CHANGE}/state.json`)).toContain('"phase": "done"');
    } finally {
      await server.close();
    }
  });

  it("ask the agent for an adjustment with the person's words (AC4)", async () => {
    const { root, server, headers } = await serving();
    try {
      await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      await cli(root, ["next"]);
      for (const task of ["T1", "T2"]) {
        await writeFiles(root, { "src/app.ts": `${task}\n` });
        await cli(root, ["task", "done", task, "--summary", task]);
      }
      const request = "El saludo va en mayúsculas.";
      expect((await call(server.port, path("adjust"), headers, { request })).status).toBe(200);
      expect(await state(root)).toMatchObject({
        phase: "adjusting",
        pending: { adjustment: { request } },
      });
    } finally {
      await server.close();
    }
  });

  it("refuse anything without the session, the origin or the CSRF token (AC5)", async () => {
    const { root, server, headers } = await serving();
    try {
      const { cookie, origin } = headers;
      const csrf = headers["x-specty-csrf"];
      const confirm = { decision: "confirmed" };
      for (const sent of [
        { cookie, origin },
        { cookie, origin, "x-specty-csrf": "wrong" },
        { cookie, "x-specty-csrf": csrf },
        { cookie, origin: "http://evil.example", "x-specty-csrf": csrf },
        { origin, "x-specty-csrf": csrf },
      ]) {
        expect((await call(server.port, path("assumptions/A1"), sent, confirm)).status).toBe(403);
      }
      expect((await call(server.port, path("approve"), headers, {})).status).toBe(400);
      expect((await call(server.port, path("dance"), headers, {})).status).toBe(400);
      expect((await state(root)).items.A1.decision).toBe("pending");
    } finally {
      await server.close();
    }
  });
});

describe("specty ui and the person's actions", () => {
  it("says whether the UI can decide, by who started it (AC1)", async () => {
    const root = await tempRepo(APP);
    for (const [terminal, says] of [
      [person(), "Desde la UI puedes aprobar, decidir el alcance, aceptar y cerrar."],
      [AGENT, "Solo lectura: lo arrancó el agente."],
    ] as const) {
      const printed: string[] = [];
      const session = await sessionAt(root, terminal, (text) => {
        printed.push(text);
      });
      await ui(session, "0", Promise.resolve());
      expect(printed.join("\n")).toContain(says);
    }
  });
});
