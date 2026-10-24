// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { type IncomingHttpHeaders, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ui } from "../src/commands/ui";
import { startServer, type UiServer } from "../src/server/http";
import { changeRecords } from "../src/server/records";
import { openSession, type Session } from "../src/session";
import {
  AGENT,
  ARCHIVE,
  CHANGE,
  cli,
  DIST,
  folderOf,
  inWorktree,
  NOW,
  person,
  testEnv,
  toClosing,
  writeFiles,
} from "./support";

/** A session in `cwd`, as the commands open it; what it prints goes to `out`. */
async function sessionAt(
  cwd: string,
  out: (text: string) => void = () => undefined,
): Promise<Session> {
  const opened = await openSession({
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error(`no Specty session in ${cwd}`);
  return opened.session;
}

const OTHER = `${CHANGE.slice(0, 8)}-otro-cambio`;

/** A repository with a closed change in main's archive and an open one in its own worktree. */
async function twoChanges() {
  const { root, folder } = await inWorktree();
  await toClosing(folder);
  expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, other: folderOf(root, OTHER) };
}

describe("the changes the server gives", () => {
  it("are the open change of each worktree and the archived ones, once each", async () => {
    const { root, other } = await twoChanges();
    const records = await changeRecords(await sessionAt(root));
    expect(records.map(({ state, folder }) => [state.id, state.phase, folder])).toEqual([
      [OTHER, "draft", other],
      [CHANGE, "done", root],
    ]);
    const [open, closed] = records;
    expect(open?.spec).toContain("# Otro cambio");
    expect(open?.phaseSince).toBe(NOW.toISOString());
    expect(closed?.approvedSpec).toContain("# Saludo personalizado");
    expect(closed?.audit?.at(-1)).toMatchObject({ event: "change.closed" });
    expect(closed?.phaseSince).toBe(closed?.audit?.at(-1)?.ts);
    // The same answer from the other worktree.
    const there = await changeRecords(await sessionAt(other));
    expect(there.map(({ state }) => state.id)).toEqual([OTHER, CHANGE]);
  });

  it("leave out an archived change whose state cannot be read", async () => {
    const { root } = await twoChanges();
    await writeFiles(root, {
      [`${ARCHIVE}/20260101-roto/spec.md`]: "# Roto\n",
      [`${ARCHIVE}/20260101-roto/state.json`]: "{}\n",
    });
    const records = await changeRecords(await sessionAt(root));
    expect(records.map(({ state }) => state.id)).toEqual([OTHER, CHANGE]);
  });
});

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/** A request to the server as a browser would make it, with the headers given. */
function ask(port: number, path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Promise<Answer>((done, fail) => {
    const sent = request(
      { host: "127.0.0.1", port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () =>
          done({ status: response.statusCode ?? 0, headers: response.headers, body }),
        );
      },
    );
    sent.on("error", fail);
    sent.end();
  });
}

/** Opens the server's link, as the person does, and returns the session cookie it sets. */
async function enter(server: UiServer): Promise<string> {
  const { pathname, search } = new URL(server.link);
  const answer = await ask(server.port, `${pathname}${search}`);
  expect(answer.status).toBe(303);
  expect(answer.headers.location).toBe("/");
  const cookie = answer.headers["set-cookie"]?.[0] ?? "";
  expect(cookie).toContain("HttpOnly; SameSite=Strict");
  return cookie.split(";")[0] ?? "";
}

async function until(check: () => boolean) {
  for (let waited = 0; !check(); waited += 20) {
    if (waited > 5000) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 20));
  }
}

describe("the local server", () => {
  it("gives the changes only to the browser that opened its link (AC2)", async () => {
    const { root } = await twoChanges();
    const server = await startServer({ session: await sessionAt(root), port: 0, ui: undefined });
    try {
      expect(server.link).toMatch(new RegExp(`^http://localhost:${server.port}/\\?token=.{40,}$`));
      expect((await ask(server.port, "/api/changes")).status).toBe(403);
      expect((await ask(server.port, "/?token=wrong")).status).toBe(403);
      const cookie = await enter(server);
      expect(cookie.startsWith(`specty-${server.port}=`)).toBe(true);
      const answer = await ask(server.port, "/api/changes", { cookie });
      expect(answer.status).toBe(200);
      expect(answer.headers["access-control-allow-origin"]).toBeUndefined();
      const ids = JSON.parse(answer.body).map(
        (record: { state: { id: string } }) => record.state.id,
      );
      expect(ids).toEqual([OTHER, CHANGE]);

      const host = `evil.example:${server.port}`;
      expect((await ask(server.port, "/api/changes", { cookie, host })).status).toBe(403);
      const origin = (value: string) => ask(server.port, "/api/changes", { cookie, origin: value });
      expect((await origin("http://evil.example")).status).toBe(403);
      expect((await origin(`http://localhost:${server.port}`)).status).toBe(200);
      expect((await ask(server.port, "/api/changes", { cookie }, "POST")).status).toBe(405);
      expect((await ask(server.port, "/api/other", { cookie })).status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("tells its listeners when a change moves (AC3)", async () => {
    const { root, other } = await twoChanges();
    const server = await startServer({
      session: await sessionAt(root),
      port: 0,
      ui: undefined,
      interval: 50,
    });
    const received: string[] = [];
    try {
      const cookie = await enter(server);
      const headers = { host: `127.0.0.1:${server.port}`, cookie };
      const stream = request({
        host: "127.0.0.1",
        port: server.port,
        path: "/api/events",
        headers,
      });
      stream.on("response", (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => received.push(chunk));
      });
      stream.on("error", () => undefined);
      stream.end();
      const heard = () => received.join("").split("event: changes").length - 1;
      await until(() => heard() === 1);
      // Let the server take its first look before anything moves.
      await new Promise((done) => setTimeout(done, 200));
      expect(heard()).toBe(1);
      await writeFiles(other, { [`.specty/changes/${OTHER}/spec.md`]: "# Otro cambio\n\nYa.\n" });
      await until(() => heard() === 2);
    } finally {
      await server.close();
    }
  });

  it("serves the built UI, marked for the server, and nothing outside it (AC4)", async () => {
    const { root } = await twoChanges();
    const parent = await mkdtemp(join(tmpdir(), "specty-ui-"));
    const ui = join(parent, "browser");
    await mkdir(ui);
    await writeFile(join(ui, "index.html"), "<html><head><title>Specty</title></head></html>");
    await writeFile(join(ui, "main.js"), "console.log(1);\n");
    await writeFile(join(parent, "secret.txt"), "secret\n");
    const server = await startServer({ session: await sessionAt(root), port: 0, ui });
    try {
      const marker = '<meta name="specty-data" content="server" /></head>';
      for (const path of ["/", "/changes/abc", "/index.html"]) {
        const page = await ask(server.port, path);
        expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
        expect(page.body).toContain(marker);
      }
      const script = await ask(server.port, "/main.js");
      expect(script.headers["content-type"]).toBe("text/javascript; charset=utf-8");
      expect(script.body).toBe("console.log(1);\n");
      expect(script.headers["x-frame-options"]).toBe("DENY");
      for (const path of ["/missing.js", "/..%2fsecret.txt", "/../secret.txt"]) {
        const answer = await ask(server.port, path);
        expect(answer.status, path).toBe(404);
        expect(answer.body).not.toContain("secret");
      }
    } finally {
      await server.close();
    }
  });

  it("explains how to build the UI when there is none, and the data stays (AC4)", async () => {
    const { root } = await twoChanges();
    const server = await startServer({ session: await sessionAt(root), port: 0, ui: undefined });
    try {
      expect((await ask(server.port, "/")).body).toContain(
        "pnpm --filter @baquia-dev/specty-ui build",
      );
      const empty = await mkdtemp(join(tmpdir(), "specty-ui-"));
      const bare = await startServer({ session: await sessionAt(root), port: 0, ui: empty });
      expect((await ask(bare.port, "/changes/abc")).body).toContain("La UI no está construida");
      await bare.close();
    } finally {
      await server.close();
    }
  });
});

describe("specty ui", () => {
  it("prints the link and serves until it is told to stop (AC1)", async () => {
    const { root } = await twoChanges();
    const printed: string[] = [];
    let stop: () => void = () => undefined;
    const stopped = new Promise<void>((done) => {
      stop = done;
    });
    const running = ui(await sessionAt(root, (text) => printed.push(text)), "0", stopped);
    await until(() => printed.length > 0);
    expect(printed[0]).toContain("SPECTY · ui");
    expect(printed[0]).toContain("Ctrl+C cierra el servidor");
    const port = Number(/http:\/\/localhost:(\d+)\/\?token=\S+/.exec(printed[0] ?? "")?.[1]);
    expect((await ask(port, "/api/changes")).status).toBe(403);
    stop();
    const output = await running;
    expect(output.status).toBe("ok");
    expect(output.next).toContain("`specty ui`");
    await expect(ask(port, "/")).rejects.toThrow();
  });

  it("refuses a port that is not one", async () => {
    const { root } = await twoChanges();
    const result = await cli(root, ["ui", "--port", "abc"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("Puerto no válido: abc.");
  });
});
