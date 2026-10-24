// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** Claude Code's `SessionStart` once it has compacted the conversation in `cwd`. */
const compacted = (cwd: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      session_id: "s1",
      cwd,
      hook_event_name: "SessionStart",
      source: "compact",
    }),
  });

describe("Specty's card after a compaction", () => {
  it("brings back what `specty next` says, with the task card", async () => {
    const root = await tempRepo(APP);
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    const card = await compacted(root);
    expect(card.code).toBe(0);
    expect(card.out).toContain("TAREA T1: Saludar por nombre");
    expect(card.out).toBe((await cli(root, ["next"])).out);
  });

  it("adds nothing outside a repository with Specty", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect(await compacted(root)).toMatchObject({ code: 0, out: "", err: "" });
  });
});
