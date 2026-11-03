// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, cli } from "../support";
import { call, serving } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

describe("Specty's memory in the local server", () => {
  it("AC1: gives every entry and the open changes as status sees them, read-only too", async () => {
    const { root, server, headers } = await serving(false);
    try {
      expect((await cli(root, ["memory", "add", "Uno"], CLAUDE)).code).toBe(0);
      expect(
        (await cli(root, ["memory", "add", "Recompilar", "--kind", "reminder"], CLAUDE)).code,
      ).toBe(0);
      expect((await cli(root, ["memory", "done", "P2"], CLAUDE)).code).toBe(0);
      const answer = await call(server.port, "/api/memory", headers);
      expect(answer.status).toBe(200);
      const body = JSON.parse(answer.body);
      expect(body.entries).toMatchObject([
        { id: "P1", kind: "pending", status: "open", text: "Uno", origin: { by: "claude-code" } },
        { id: "P2", kind: "reminder", status: "done", text: "Recompilar" },
      ]);
      expect(body.changes).toMatchObject([
        { id: CHANGE, kind: "standard", phase: "review", waitingFor: "human", current: true },
      ]);
    } finally {
      await server.close();
    }
  });

  it("AC1: gives an empty memory before its branch exists, and nothing without the session", async () => {
    const { server, headers } = await serving();
    try {
      const empty = await call(server.port, "/api/memory", headers);
      expect(JSON.parse(empty.body)).toMatchObject({ entries: [], changes: [{ id: CHANGE }] });
      expect((await call(server.port, "/api/memory")).status).toBe(403);
    } finally {
      await server.close();
    }
  });
});
