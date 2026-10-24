// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, cli, read, SPEC, SPEC_PATH, writeFiles } from "../support";
import { call, path, serving } from "./support";

describe("comments from the UI", () => {
  it("are saved, and asking for changes sends them to the agent (AC4)", async () => {
    const { root, server, headers } = await serving();
    try {
      const anchor = { section: "design", quote: "saludo" };
      const saved = await call(server.port, path("comments"), headers, { anchor, body: "Corto." });
      expect(saved.status).toBe(200);
      const comments = JSON.parse(await read(root, `.specty/changes/${CHANGE}/comments.json`));
      expect(comments).toMatchObject([{ id: "c1", anchor, author: "Ana", body: "Corto." }]);
      expect((await call(server.port, path("request-changes"), headers, {})).status).toBe(200);
      expect((await cli(root, ["next"])).out).toContain("c1 · Diseño «saludo»: Corto.");
      // The next revision resolves it: asking again is refused by the flow.
      await writeFiles(root, { [SPEC_PATH]: SPEC.replace("se usa «mundo»", "se usa «amigo»") });
      expect((await cli(root, ["propose"])).code).toBe(0);
      const again = await call(server.port, path("request-changes"), headers, {});
      expect(again.status).toBe(409);
    } finally {
      await server.close();
    }
  });

  it("refuse a malformed comment and a server the agent started", async () => {
    const { server, headers } = await serving();
    try {
      for (const body of [
        { body: "x" },
        { anchor: { section: "design" }, body: "x" },
        { anchor: { item: "A1" } },
      ]) {
        expect((await call(server.port, path("comments"), headers, body)).status).toBe(400);
      }
    } finally {
      await server.close();
    }
    const readOnly = await serving(false);
    try {
      const sent = { anchor: { item: "A1" }, body: "x" };
      const refused = await call(readOnly.server.port, path("comments"), readOnly.headers, sent);
      expect(refused.status).toBe(403);
    } finally {
      await readOnly.server.close();
    }
  });
});
