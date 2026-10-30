// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { resolveActive } from "../../../src/flow/active";
import { readComments } from "../../../src/store/comments";
import { person } from "../../support";
import { call, path, serving, sessionAt } from "../../server/support";

describe("comments and approval actions in server", () => {
  it("AC2: edits comment via action in server", async () => {
    const { root, server, headers } = await serving();
    try {
      const added = await call(server.port, path("comments"), headers, {
        anchor: { item: "A1" },
        body: "Comentario original",
      });
      expect(added.status).toBe(200);

      const edited = await call(server.port, path("comments/c1"), headers, {
        body: "Comentario editado",
      });
      expect(edited.status).toBe(200);

      const session = await sessionAt(root, person());
      const active = await resolveActive(session);
      expect(active).toBeDefined();
      if (active === undefined) throw new Error("no active change");
      const comments = await readComments(active.files);
      expect(comments.find((c) => c.id === "c1")?.body).toBe("Comentario editado");
    } finally {
      await server.close();
    }
  });

  it("AC3: deletes comment via action in server", async () => {
    const { root, server, headers } = await serving();
    try {
      await call(server.port, path("comments"), headers, {
        anchor: { item: "A1" },
        body: "Comentario a borrar",
      });

      const deleted = await call(server.port, path("comments/c1"), headers, {
        delete: true,
      });
      expect(deleted.status).toBe(200);

      const session = await sessionAt(root, person());
      const active = await resolveActive(session);
      expect(active).toBeDefined();
      if (active === undefined) throw new Error("no active change");
      const comments = await readComments(active.files);
      expect(comments.find((c) => c.id === "c1")).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("AC5: refuses approval when open comments exist", async () => {
    const { server, headers } = await serving();
    try {
      await call(server.port, path("assumptions/A1"), headers, { decision: "confirmed" });
      await call(server.port, path("comments"), headers, {
        anchor: { item: "A1" },
        body: "Comentario pendiente",
      });

      const approveRes = await call(server.port, path("approve"), headers, { revision: 1 });
      expect(approveRes.status).toBe(409);
      expect(approveRes.body).toContain("comentario");
    } finally {
      await server.close();
    }
  });
});
