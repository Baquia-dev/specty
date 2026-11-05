// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer, type UiServer } from "../src/server/http";
import { call, sessionAt } from "./server/support";
import {
  AGENT,
  ARCHIVE,
  CHANGE,
  cli,
  folderOf,
  inWorktree,
  NOW,
  person,
  read,
  SPEC,
  SPEC_PATH,
  writeFiles,
} from "./support";

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
const OTHER = `${CHANGE.slice(0, 8)}-otro-cambio`;
const ARCHIVED = "20260101-archivado";

/**
 * The repository of `lostFolder` with another change open in its own worktree and, in the main
 * folder's archive, a finished one: the state of the open one with the archived id.
 */
async function withOpenAndArchived(root: string) {
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  const base = JSON.parse(await read(folderOf(root, OTHER), `.specty/changes/${OTHER}/state.json`));
  const closed = { ts: NOW.toISOString(), actor: "human", event: "change.closed", data: {} };
  await writeFiles(root, {
    [`${ARCHIVE}/${ARCHIVED}/spec.md`]: "---\nkind: standard\n---\n\n# Archivado\n",
    [`${ARCHIVE}/${ARCHIVED}/state.json`]: `${JSON.stringify({ ...base, id: ARCHIVED, phase: "done" })}\n`,
    [`${ARCHIVE}/${ARCHIVED}/audit.jsonl`]: `${JSON.stringify(closed)}\n`,
  });
}

/** The id of each record, with whether it lost its folder. */
const listed = (records: readonly { state: { id: string }; lost?: boolean }[]) =>
  records.map((record) => [record.state.id, record.lost === true]);

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

  it("AC1: the list gives the open change of each worktree, then those without their folder, and no archived one", async () => {
    const { root } = await lostFolder();
    await withOpenAndArchived(root);
    const { server, headers } = await served(root);
    try {
      const list = await call(server.port, "/api/changes", headers);
      expect(list.status).toBe(200);
      expect(listed(JSON.parse(list.body))).toEqual([
        [OTHER, false],
        [CHANGE, true],
      ]);
      // The archived change is there: in its page of finished changes and by its id.
      const page = JSON.parse((await call(server.port, "/api/changes/finished", headers)).body);
      expect(page.changes.map((change: { id: string }) => change.id)).toEqual([ARCHIVED]);
      expect((await call(server.port, `/api/changes/${ARCHIVED}`, headers)).status).toBe(200);
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
