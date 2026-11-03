// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli } from "../support";
import { call, serving } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (root: string, ...args: string[]) => cli(root, ["memory", ...args], CLAUDE);

/** The memory's entries as the UI reads them. */
const entries = async (port: number, headers: Record<string, string>) =>
  JSON.parse((await call(port, "/api/memory", headers)).body).entries;

describe("the memory's actions in the local server", () => {
  it("AC1: drops an entry for the person, with its reason or the one of the proposal", async () => {
    const { root, server, headers } = await serving();
    try {
      expect((await add(root, "add", "Uno")).code).toBe(0);
      expect((await add(root, "add", "Dos")).code).toBe(0);
      expect((await add(root, "drop", "P2", "--reason", "Duplica P1.")).code).toBe(0);
      const mine = await call(server.port, "/api/memory/P1/drop", headers, {
        reason: "Ya no aplica.",
      });
      expect(mine.status).toBe(200);
      expect((await call(server.port, "/api/memory/P2/drop", headers, {})).status).toBe(200);
      expect(await entries(server.port, headers)).toMatchObject([
        { id: "P1", status: "dropped", drop: { reason: "Ya no aplica.", by: "person" } },
        { id: "P2", status: "dropped", drop: { reason: "Duplica P1.", by: "person" } },
      ]);
    } finally {
      await server.close();
    }
  });

  it("AC2: keeps a proposed entry and marks a reminder done, and refuses what Specty refuses", async () => {
    const { root, server, headers } = await serving();
    try {
      expect((await add(root, "add", "Uno")).code).toBe(0);
      expect((await add(root, "drop", "P1", "--reason", "No hace falta.")).code).toBe(0);
      expect((await add(root, "add", "Recompilar", "--kind", "reminder")).code).toBe(0);
      expect((await call(server.port, "/api/memory/P1/keep", headers, {})).status).toBe(200);
      expect((await call(server.port, "/api/memory/P2/done", headers, {})).status).toBe(200);
      const list = await entries(server.port, headers);
      expect(list).toMatchObject([
        { id: "P1", status: "open" },
        { id: "P2", status: "done", closed: { by: "person" } },
      ]);
      expect(list[0]).not.toHaveProperty("drop");
      expect(
        (await call(server.port, "/api/memory/P9/drop", headers, { reason: "x" })).status,
      ).toBe(409);
      expect((await call(server.port, "/api/memory/P1/borrar", headers, {})).status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("AC3: refuses them on a server the agent started", async () => {
    const { root, server, headers } = await serving(false);
    try {
      expect((await add(root, "add", "Uno")).code).toBe(0);
      const refused = await call(server.port, "/api/memory/P1/drop", headers, { reason: "x" });
      expect(refused.status).toBe(403);
      expect(await entries(server.port, headers)).toMatchObject([{ id: "P1", status: "open" }]);
    } finally {
      await server.close();
    }
  });
});
