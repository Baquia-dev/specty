// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer, type UiServer } from "../src/server/http";
import { call, sessionAt } from "./server/support";
import { AGENT, CHANGE, cli, inWorktree, person, SPEC, SPEC_PATH, writeFiles } from "./support";

/** A repository whose change, approved in its own folder, lost that folder. */
async function lostFolder() {
  const made = await inWorktree();
  await writeFiles(made.folder, { [SPEC_PATH]: SPEC });
  expect((await cli(made.folder, ["propose"])).code).toBe(0);
  const approved = await cli(made.folder, ["approve"], {
    terminal: person({ choose: ["confirm"] }),
  });
  expect(approved.code).toBe(0);
  await rm(made.folder, { recursive: true, force: true });
  return made;
}

/** The server the person starts in `root` (or the agent's, read only), and its session's headers. */
async function served(root: string, actions = true) {
  const server = await startServer({
    session: await sessionAt(root, AGENT),
    port: 0,
    ui: undefined,
    actions,
  });
  return { server, headers: await signIn(server) };
}

/** Opens the server's link and reads its session: the cookie, the origin and the CSRF token. */
async function signIn(server: UiServer): Promise<Record<string, string>> {
  const { pathname, search } = new URL(server.link);
  const cookie = (await call(server.port, `${pathname}${search}`)).headers["set-cookie"]?.[0];
  const headers = {
    cookie: cookie?.split(";")[0] ?? "",
    origin: `http://localhost:${server.port}`,
  };
  const session = JSON.parse((await call(server.port, "/api/session", headers)).body);
  return { ...headers, "x-specty-csrf": session.csrf ?? "" };
}

const RESTORE = `/api/changes/${CHANGE}/restore`;

describe("the server and a change without its folder", () => {
  it("AC1: lists it with its spec and state, marked lost and with no folder", async () => {
    const { root } = await lostFolder();
    const { server, headers } = await served(root);
    try {
      const records = JSON.parse((await call(server.port, "/api/changes", headers)).body);
      const lost = records.find((record: { state: { id: string } }) => record.state.id === CHANGE);
      expect(lost).toMatchObject({ lost: true, state: { id: CHANGE, phase: "implementing" } });
      expect(lost.spec).toContain("# Saludo personalizado");
      expect(lost).not.toHaveProperty("folder");
      expect(Number.isNaN(Date.parse(lost.phaseSince))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("AC2: brings the folder back as `specty restore`, and then lists it in its folder", async () => {
    const { root, folder } = await lostFolder();
    const { server, headers } = await served(root);
    try {
      const restored = await call(server.port, RESTORE, headers, {});
      expect(restored.status).toBe(200);
      expect(JSON.parse(restored.body)).toMatchObject({ status: "ok" });
      expect(restored.body).toContain(`Carpeta recuperada: ${CHANGE}`);
      expect(existsSync(join(folder, SPEC_PATH))).toBe(true);
      const records = JSON.parse((await call(server.port, "/api/changes", headers)).body);
      const back = records.find((record: { state: { id: string } }) => record.state.id === CHANGE);
      expect(back).not.toHaveProperty("lost");
      expect(back.folder).toBe(folder);
    } finally {
      await server.close();
    }
  });

  it("AC2: refuses without the session or its token, and in a read-only server, touching nothing", async () => {
    const { root, folder } = await lostFolder();
    const { server, headers } = await served(root);
    try {
      const { "x-specty-csrf": _, ...noToken } = headers;
      expect((await call(server.port, RESTORE, noToken, {})).status).toBe(403);
      expect((await call(server.port, RESTORE, {}, {})).status).toBe(403);
      expect(existsSync(folder)).toBe(false);
    } finally {
      await server.close();
    }
    const readOnly = await served(root, false);
    try {
      const refused = await call(readOnly.server.port, RESTORE, readOnly.headers, {});
      expect([refused.status, refused.body]).toEqual([403, '{"error":"read-only"}']);
      expect(existsSync(folder)).toBe(false);
    } finally {
      await readOnly.server.close();
    }
  });

  it("AC2: answers 409 with the reason when the folder cannot be brought back", async () => {
    const { root } = await lostFolder();
    const { server, headers } = await served(root);
    try {
      const unknown = await call(
        server.port,
        "/api/changes/20990101-no-existe/restore",
        headers,
        {},
      );
      expect(unknown.status).toBe(409);
      expect(unknown.body).toContain(
        "No hay un cambio abierto sin carpeta con el id 20990101-no-existe.",
      );
    } finally {
      await server.close();
    }
  });
});
