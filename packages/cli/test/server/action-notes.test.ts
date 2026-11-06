// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer, type UiServer } from "../../src/server/http";
import { AGENT, CHANGE, inWorktree, toClosing } from "../support";
import { call, listen, sessionAt } from "./support";

const LOCKS = ".git/common/specty/locks";
const LOCK = `${LOCKS}/full-verification.json`;
const WAITING = "otra sesión está haciendo una verificación completa";

/** Another session's live process, holding the full verification's turn until it is killed. */
function otherSessionVerifies(root: string) {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
  const holder = {
    pid: child.pid ?? 0,
    command: "pnpm check",
    folder: "/otra/carpeta",
    at: "2026-11-06T08:00:00.000Z",
  };
  mkdirSync(join(root, LOCKS), { recursive: true });
  writeFileSync(join(root, LOCK), JSON.stringify(holder));
  return child;
}

/** The headers of the person's page: its session cookie, its origin and the CSRF token. */
async function enter(server: UiServer): Promise<Record<string, string>> {
  const { pathname, search } = new URL(server.link);
  const cookie = (await call(server.port, `${pathname}${search}`)).headers["set-cookie"]?.[0];
  const headers = {
    cookie: cookie?.split(";")[0] ?? "",
    origin: `http://localhost:${server.port}`,
  };
  const session = JSON.parse((await call(server.port, "/api/session", headers)).body);
  return { ...headers, "x-specty-csrf": session.csrf ?? "" };
}

/** Waits, in real time, until `holds` or `ms` pass: what was heard is checked afterwards. */
async function within(ms: number, holds: () => boolean): Promise<void> {
  const deadline = Date.now() + ms;
  while (!holds() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 20));
}

describe("the person's actions from the UI tell how they go", () => {
  it("AC1: a closing that waits for another session's turn sends its start, the line it waits with and its end", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    const server = await startServer({
      session: await sessionAt(root, AGENT),
      port: 0,
      ui: undefined,
      actions: true,
    });
    const headers = await enter(server);
    const events = listen(server.port, headers);
    const told = () =>
      events.heard
        .filter(({ name }) => name === "action")
        .map(({ data }): Record<string, unknown> => JSON.parse(data));
    const other = otherSessionVerifies(root);
    try {
      await events.until(({ name }) => name === "changes");
      const answer = call(server.port, `/api/changes/${CHANGE}/close`, headers, {});
      await within(15_000, () => told().some(({ note }) => String(note).includes(WAITING)));
      other.kill();
      expect((await answer).status).toBe(200);
      await within(5_000, () => told().some(({ done }) => done === true));

      const heard = told();
      expect(heard[0]).toEqual({ change: CHANGE, action: "close" });
      expect(heard).toContainEqual({
        change: CHANGE,
        action: "close",
        note: expect.stringContaining(WAITING),
      });
      const note = heard.find(({ note }) => typeof note === "string");
      expect(note?.note).toContain("(`pnpm check` en /otra/carpeta, desde las 08:00 UTC)");
      expect(heard.at(-1)).toEqual({ change: CHANGE, action: "close", done: true });
      expect(heard.filter(({ done }) => done === true)).toHaveLength(1);
    } finally {
      other.kill();
      events.close();
      await server.close();
    }
  });
});
