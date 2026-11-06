// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_CONFIG, defaultGlossary } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { writeFiles } from "../support";
import { call, serving } from "./support";

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
