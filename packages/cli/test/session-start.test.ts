// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** The agent's `SessionStart` in `cwd`; by default, once it has compacted the conversation. */
const started = (cwd: string, tool: "claude-code" | "codex", source = "compact") =>
  cli(cwd, ["guard", "--tool", tool], {
    stdin: JSON.stringify({ session_id: "s1", cwd, hook_event_name: "SessionStart", source }),
  });

for (const tool of ["claude-code", "codex"] as const) {
  describe(`Specty's card after a compaction in ${tool}`, () => {
    it("brings back what `specty next` says, with the task card (AC1)", async () => {
      const root = await tempRepo(APP);
      await cli(root, ["new", "Saludo personalizado"]);
      await writeFiles(root, { [SPEC_PATH]: SPEC });
      await cli(root, ["propose"]);
      await cli(root, ["approve"], { terminal: person() });
      const card = await started(root, tool);
      expect(card.code).toBe(0);
      expect(card.out).toContain("TAREA T1: Saludar por nombre");
      expect(card.out).toBe((await cli(root, ["next"])).out);
    });

    it("adds nothing outside a repository with Specty (AC2)", async () => {
      const root = await tempRepo({ "src/app.ts": "x\n" });
      expect(await started(root, tool)).toMatchObject({ code: 0, out: "", err: "" });
    });
  });
}

describe("Codex's other session starts", () => {
  it("add nothing, even if its matcher let them through (AC2)", async () => {
    const root = await tempRepo(APP);
    await cli(root, ["new", "Saludo personalizado"]);
    for (const source of ["startup", "resume", "clear", "fork"]) {
      expect(await started(root, "codex", source), source).toMatchObject({
        code: 0,
        out: "",
        err: "",
      });
    }
  });
});
