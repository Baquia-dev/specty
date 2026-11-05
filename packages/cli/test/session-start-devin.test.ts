// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

const HOOKS = ".devin/hooks.v1.json";

/** Devin's `SessionStart` in `cwd`, from `source`. */
const started = (cwd: string, source: string) =>
  cli(cwd, ["guard", "--tool", "windsurf"], {
    stdin: JSON.stringify({ session_id: "s1", cwd, hook_event_name: "SessionStart", source }),
  });

describe("Specty's card as a Devin session starts", () => {
  it("AC3: brings what `specty next` says as SessionStart's additionalContext", async () => {
    const root = await tempRepo(APP);
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    const next = (await cli(root, ["next"])).out;
    expect(next).toContain("TAREA T1: Saludar por nombre");
    for (const source of ["startup", "resume"]) {
      const card = await started(root, source);
      expect(card.code, source).toBe(0);
      expect(JSON.parse(card.out), source).toEqual({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: next },
      });
    }
  });

  it("AC3: adds nothing outside a repository with Specty", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect(await started(root, "startup")).toMatchObject({ code: 0, out: "" });
  });

  it("AC3: init writes SessionStart, with no matcher, to Devin's hooks", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect((await cli(root, ["init", "--language", "es", "--tools", "windsurf"])).code).toBe(0);
    const hooks = JSON.parse(await read(root, HOOKS));
    expect(hooks.SessionStart).toEqual([
      {
        hooks: [{ type: "command", command: expect.stringContaining("guard --tool windsurf") }],
      },
    ]);
  });
});
