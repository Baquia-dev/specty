// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_CONFIG, defaultGlossary } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { startServer, type UiServer } from "../../src/server/http";
import { AGENT, CHANGE, CONFIG, cli, git, person, read, tempRepo, writeFiles } from "../support";
import { call, serving, sessionAt } from "./support";

const CONFIG_PATH = ".specty/config.yaml";

/** `GET /api/config` with the session, as the browser reads it. */
async function readConfig(port: number, headers: Record<string, string>) {
  const answer = await call(port, "/api/config", headers);
  expect(answer.status).toBe(200);
  return JSON.parse(answer.body);
}

describe("the configuration in the local server", () => {
  it("AC1: gives the file as read, what Specty uses and the defaults, with its language's glossary", async () => {
    const { server, headers } = await serving(false);
    try {
      const body = await readConfig(server.port, headers);
      expect(body.input).toEqual({
        version: 1,
        language: "es",
        git: { worktrees: false },
        verify: { default: "true" },
      });
      expect(body.config.language).toBe("es");
      expect(body.config.git.worktrees).toBe(false);
      expect(body.config.verify).toEqual({
        default: "true",
        timeoutSec: DEFAULT_CONFIG.verify.timeoutSec,
        slots: DEFAULT_CONFIG.verify.slots,
      });
      expect(body.config.glossary).toBe(defaultGlossary("es"));
      expect(body.defaults).toEqual({ ...DEFAULT_CONFIG, glossary: defaultGlossary("es") });
      expect(body.issues).toEqual([]);
      expect((await call(server.port, "/api/config")).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("AC4: reads the file again on each request and gives the validator's issues by key, without what Specty uses", async () => {
    const { root, server, headers } = await serving(false);
    try {
      expect((await readConfig(server.port, headers)).issues).toEqual([]);
      await writeFiles(root, {
        [CONFIG_PATH]: "version: 1\nlanguage: es\nverify:\n  timeoutSec: mucho\nfuturo: true\n",
      });
      const body = await readConfig(server.port, headers);
      expect(body.input).toEqual({
        version: 1,
        language: "es",
        verify: { timeoutSec: "mucho" },
        futuro: true,
      });
      expect(body).not.toHaveProperty("config");
      expect(body.defaults).toEqual({ ...DEFAULT_CONFIG, glossary: defaultGlossary("es") });
      const paths = body.issues.map((issue: { path: string }) => issue.path);
      expect(paths).toEqual(expect.arrayContaining(["verify.timeoutSec", ""]));
      expect(body.issues).toContainEqual({ path: "", message: 'Unrecognized key: "futuro"' });
    } finally {
      await server.close();
    }
  });

  it("AC4: gives a file that is not YAML as an issue at the root, with nothing read", async () => {
    const { root, server, headers } = await serving(false);
    try {
      await writeFiles(root, { [CONFIG_PATH]: "version: [1\n" });
      const body = await readConfig(server.port, headers);
      expect(body).not.toHaveProperty("input");
      expect(body).not.toHaveProperty("config");
      expect(body.defaults).toEqual(DEFAULT_CONFIG);
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0].path).toBe("");
      expect(body.issues[0].message).not.toBe("");
    } finally {
      await server.close();
    }
  });
});

/** A server in a repository with no change open: the person's, or the agent's (read only). */
async function servingConfig(actions: boolean) {
  const root = await tempRepo({ [CONFIG_PATH]: CONFIG() });
  const server = await startServer({
    session: await sessionAt(root, AGENT),
    port: 0,
    ui: undefined,
    actions,
  });
  return { root, server, headers: await entered(server) };
}

/** Opens the server's link and reads its session: the headers every action needs. */
async function entered(server: UiServer): Promise<Record<string, string>> {
  const { pathname, search } = new URL(server.link);
  const cookie = (await call(server.port, `${pathname}${search}`)).headers["set-cookie"]?.[0];
  const headers = {
    cookie: cookie?.split(";")[0] ?? "",
    origin: `http://localhost:${server.port}`,
  };
  const session = JSON.parse((await call(server.port, "/api/session", headers)).body);
  return { ...headers, "x-specty-csrf": session.csrf ?? "" };
}

const TIMEOUT = [{ path: ["verify", "timeoutSec"], value: 900 }];

describe("saving the configuration through the local server", () => {
  it("AC1: checks some edits without writing, with the issues and the changes by setting", async () => {
    const { root, server, headers } = await servingConfig(true);
    try {
      const head = git(root, "rev-parse", "HEAD");
      const checked = await call(server.port, "/api/config/check", headers, {
        edits: [{ path: ["size", "M"], value: 12 }, { path: ["verify", "default"] }],
      });
      expect(checked.status).toBe(200);
      expect(JSON.parse(checked.body)).toEqual({
        issues: [],
        changes: [
          { key: "verify.default", before: "true" },
          { key: "size", after: { M: 12 } },
        ],
      });
      expect(await read(root, CONFIG_PATH)).toBe(CONFIG());
      expect(git(root, "rev-parse", "HEAD")).toBe(head);
      for (const path of [
        ["version"],
        ["verify", "units"],
        ["ui", "requireUserPresence"],
        ["specty delegate"],
      ]) {
        const bad = await call(server.port, "/api/config/check", headers, {
          edits: [{ path, value: 1 }],
        });
        expect(bad.status, path.join(".")).toBe(400);
      }
      expect((await call(server.port, "/api/config/check", headers, { edits: "x" })).status).toBe(
        400,
      );
    } finally {
      await server.close();
    }
  });

  it("AC2: saves only the changed keys in a commit of their own and answers it", async () => {
    const { root, server, headers } = await servingConfig(true);
    try {
      const saved = await call(server.port, "/api/config", headers, { edits: TIMEOUT });
      expect(saved.status).toBe(200);
      const body = JSON.parse(saved.body);
      expect(body.commit).toMatch(/^[0-9a-f]{7}$/);
      expect(body.changes).toEqual([{ key: "verify.timeoutSec", after: 900 }]);
      expect(await read(root, CONFIG_PATH)).toBe(
        CONFIG().replace('default: "true"\n', 'default: "true"\n  timeoutSec: 900\n'),
      );
      expect(git(root, "log", "-1", "--format=%h%n%s%n%n%b")).toBe(
        `${body.commit}\nchore(config): verify.timeoutSec\n\nSpecty-Config: true`,
      );
      const again = JSON.parse((await call(server.port, "/api/config", headers)).body);
      expect(again.config.verify.timeoutSec).toBe(900);
      expect(again).not.toHaveProperty("blocked");
    } finally {
      await server.close();
    }
  });

  it("AC3: refuses to save a configuration the validator rejects, with its issues", async () => {
    const { root, server, headers } = await servingConfig(true);
    try {
      const edits = [{ path: ["size", "M"], value: 20 }];
      const checked = JSON.parse(
        (await call(server.port, "/api/config/check", headers, { edits })).body,
      );
      expect(checked.issues.map((issue: { path: string }) => issue.path)).toContain("size");
      const saved = await call(server.port, "/api/config", headers, { edits });
      expect(saved.status).toBe(409);
      const body = JSON.parse(saved.body);
      expect(body.error).toBe("invalid");
      expect(body.issues.map((issue: { path: string }) => issue.path)).toContain("size");
      expect(await read(root, CONFIG_PATH)).toBe(CONFIG());
    } finally {
      await server.close();
    }
  });

  it("AC4: an agent's server refuses to check and to save, also in delegated mode", async () => {
    const { root, server, headers } = await servingConfig(false);
    try {
      const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
      expect(on.code).toBe(0);
      for (const path of ["/api/config/check", "/api/config"]) {
        const refused = await call(server.port, path, headers, { edits: TIMEOUT });
        expect(refused.status, path).toBe(403);
        expect(JSON.parse(refused.body), path).toEqual({ error: "read-only" });
      }
      expect(await read(root, CONFIG_PATH)).toBe(CONFIG());
    } finally {
      await server.close();
    }
  });

  it("AC5: says it is blocked by the change in progress, and refuses to save", async () => {
    const { root, server, headers } = await serving(true);
    try {
      const body = JSON.parse((await call(server.port, "/api/config", headers)).body);
      expect(body.blocked).toEqual({ kind: "change", id: CHANGE });
      const saved = await call(server.port, "/api/config", headers, { edits: TIMEOUT });
      expect(saved.status).toBe(409);
      expect(JSON.parse(saved.body)).toEqual({ error: "change", id: CHANGE });
      expect(await read(root, CONFIG_PATH)).toBe(CONFIG());
    } finally {
      await server.close();
    }
  });

  it("AC5: says it is blocked by uncommitted changes of the file", async () => {
    const { root, server, headers } = await servingConfig(true);
    try {
      await writeFiles(root, { [CONFIG_PATH]: `${CONFIG()}# a medias\n` });
      const body = JSON.parse((await call(server.port, "/api/config", headers)).body);
      expect(body.blocked).toEqual({ kind: "uncommitted" });
      const saved = await call(server.port, "/api/config", headers, { edits: TIMEOUT });
      expect(saved.status).toBe(409);
      expect(JSON.parse(saved.body)).toEqual({ error: "uncommitted" });
    } finally {
      await server.close();
    }
  });
});
