// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, git } from "../support";
import { call, implemented, path, serving } from "./support";

/** The line `src/app.ts` starts with, from the repository's first commit, outside Specty. */
const BASE = APP["src/app.ts"].trimEnd();
const GREET = "export const greet = (name: string) => 'Hola, ' + name;";
const BYE = "export const bye = 1;";

const commitOf = (root: string, task: string) =>
  git(root, "log", "--all", "-n", "1", "--format=%h", `--grep=Specty-Task: ${task}`);

describe("the traceability in the local server", () => {
  it("AC1: lists the files the change left, and none before its first commit", async () => {
    const { root, server, headers } = await serving();
    try {
      // In review nothing has a commit yet.
      expect((await call(server.port, path("trace"), headers)).status).toBe(404);
      await implemented(root, `${BASE}\n${GREET}\n`, `${BASE}\n${GREET}\n${BYE}\n`);
      const listed = await call(server.port, path("trace"), headers);
      expect(listed.status).toBe(200);
      expect(JSON.parse(listed.body)).toEqual({ files: ["src/app.ts"] });
      const unknown = await call(server.port, "/api/changes/20990101-nada/trace", headers);
      expect(unknown.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("AC2: gives the file as the change left it, in blocks with the change, task and criteria behind them", async () => {
    const { root, server, headers } = await serving();
    try {
      await implemented(root, `${BASE}\n${GREET}\n`, `${BASE}\n${GREET}\n${BYE}\n`);
      const answer = await call(server.port, `${path("trace")}?path=src/app.ts`, headers);
      expect(answer.status).toBe(200);
      const traced = JSON.parse(answer.body);
      expect(traced.path).toBe("src/app.ts");
      expect(traced.commit).toBe(commitOf(root, "T2"));
      expect(traced.lines).toEqual([BASE, GREET, BYE]);
      const base = git(root, "rev-list", "--max-parents=0", "--abbrev-commit", "HEAD");
      expect(traced.blocks).toMatchObject([
        { start: 1, end: 1, commit: { commit: base } },
        {
          start: 2,
          end: 2,
          commit: {
            commit: commitOf(root, "T1"),
            change: {
              id: CHANGE,
              title: "Saludo personalizado",
              task: { id: "T1", title: "Saludar por nombre" },
              criteria: [{ id: "AC1" }],
            },
          },
        },
        {
          start: 3,
          end: 3,
          commit: {
            commit: commitOf(root, "T2"),
            change: { id: CHANGE, task: { id: "T2", title: "Mensaje por defecto" } },
          },
        },
      ]);
      // The first commit is outside Specty: it has no change behind it.
      expect(traced.blocks[0].commit).not.toHaveProperty("change");
      expect(traced.blocks[1].commit).toMatchObject({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        author: expect.any(String),
        subject: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });

  it("AC3: reads no file outside the change, needs the session, and is read from the agent's server too", async () => {
    const { root, server, headers } = await serving(false);
    try {
      await implemented(root, `${BASE}\n${GREET}\n`);
      for (const outside of [".specty/config.yaml", "src/otro.ts", "../../etc/passwd", ""]) {
        const query = `?path=${encodeURIComponent(outside)}`;
        expect((await call(server.port, `${path("trace")}${query}`, headers)).status).toBe(404);
      }
      expect((await call(server.port, `${path("trace")}?path=src/app.ts`, headers)).status).toBe(
        200,
      );
      const anonymous = await call(server.port, path("trace"), { origin: headers.origin });
      expect(anonymous.status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("AC3: refuses a blame too large to serve", async () => {
    const { root, server, headers } = await serving();
    try {
      // Generated, as huge files usually are: task done does not size it.
      await implemented(
        root,
        `// @generated\n${"una línea de texto bastante larga\n".repeat(20_000)}`,
      );
      const big = await call(server.port, `${path("trace")}?path=src/app.ts`, headers);
      expect(big.status).toBe(413);
      expect(JSON.parse(big.body)).toMatchObject({ error: "too large" });
    } finally {
      await server.close();
    }
  });
});
