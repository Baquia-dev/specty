// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { git } from "../support";
import { call, implemented, path, serving } from "./support";

const GREET = "export const greet = (name: string) => 'Hola, ' + name;";

describe("diffs in the local server", () => {
  it("give each task done its commit, and the diff of a task or of the change (AC1, AC2)", async () => {
    const { root, server, headers } = await serving();
    try {
      await implemented(root, `${GREET}\n`, "x\n");
      const [record] = JSON.parse((await call(server.port, "/api/changes", headers)).body);
      const commitOf = (task: string) =>
        git(root, "log", "--all", "-n", "1", "--format=%h", `--grep=Specty-Task: ${task}`);
      expect(record.state.tasks.T1.commit).toBe(commitOf("T1"));
      expect(record.state.tasks.T2.commit).toBe(commitOf("T2"));
      const whole = await call(server.port, path("diff"), headers);
      expect([whole.status, whole.headers["content-type"]]).toEqual([
        200,
        "text/plain; charset=utf-8",
      ]);
      expect(whole.body).toContain("diff --git a/src/app.ts b/src/app.ts");
      expect(whole.body).toContain("+x");
      expect(whole.body).not.toContain(".specty/");
      const first = (await call(server.port, `${path("diff")}?task=T1`, headers)).body;
      expect(first).toContain(`+${GREET}`);
      expect(first).not.toContain("+x");
      for (const missing of [`${path("diff")}?task=T9`, "/api/changes/20990101-nada/diff"]) {
        expect((await call(server.port, missing, headers)).status).toBe(404);
      }
      expect((await call(server.port, path("diff"), { origin: headers.origin })).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("are read even from the agent's server, and refused when they do not fit (AC2, AC3)", async () => {
    const { root, server, headers } = await serving(false);
    try {
      // In review nothing has a commit yet.
      expect((await call(server.port, path("diff"), headers)).status).toBe(404);
      await implemented(root, `${"una línea de texto bastante larga\n".repeat(20_000)}`);
      const big = await call(server.port, path("diff"), headers);
      expect(big.status).toBe(413);
      expect(JSON.parse(big.body)).toEqual({
        error: "too large",
        range: expect.stringMatching(/^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/),
      });
    } finally {
      await server.close();
    }
  });
});
