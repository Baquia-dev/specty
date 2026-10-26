// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, git, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";
const CHECKS = "checks:\n  levels: { secrets: off }\n";

async function failing(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${config}${CHECKS}` });
  await writeFiles(root, {
    "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
  });
  return root;
}

const stop = (root: string, tool: string, input: unknown) =>
  cli(root, ["hook", "agent-stop", tool], { stdin: JSON.stringify(input) });

describe("specty hook agent-stop", () => {
  it("sends Claude Code and Codex back to work while specty check --changed fails", async () => {
    const root = await failing();
    for (const tool of ["claude-code", "codex"]) {
      const run = await stop(root, tool, { hook_event_name: "Stop", stop_hook_active: false });
      expect(run.code).toBe(0);
      const reply = JSON.parse(run.out);
      expect(reply.decision).toBe("block");
      expect(reply.reason).toContain(
        "`specty check --changed` falla; corrígelo antes de terminar el turno:",
      );
      expect(reply.reason).toContain(
        `FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`,
      );
      // Already sent back once: it may end now, so that it never loops.
      expect(await stop(root, tool, { stop_hook_active: true })).toMatchObject({
        code: 0,
        out: "",
      });
    }
  });

  it("gives Cursor a follow-up message, only when its turn completed", async () => {
    const root = await failing();
    const run = await stop(root, "cursor", { status: "completed", loop_count: 0 });
    expect(JSON.parse(run.out).followup_message).toContain(
      `FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`,
    );
    expect(await stop(root, "cursor", { status: "aborted", loop_count: 0 })).toMatchObject({
      code: 0,
      out: "",
    });
  });

  it("says nothing when the checks pass, and outside a Specty repository", async () => {
    const clean = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    expect(await stop(clean, "claude-code", { stop_hook_active: false })).toMatchObject({
      code: 0,
      out: "",
    });
    const elsewhere = await mkdtemp(join(tmpdir(), "specty-elsewhere-"));
    git(elsewhere, "init", "-q");
    expect(await stop(elsewhere, "codex", { stop_hook_active: false })).toMatchObject({
      code: 0,
      out: "",
    });
  });

  it("adds the plan's checks while a change is approved, and speaks English", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG().replace("language: es", "language: en")}${CHECKS}`,
    });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await writeFiles(root, { "lib/other.ts": "export const other = 1;\n" });
    const reply = JSON.parse((await stop(root, "claude-code", { stop_hook_active: false })).out);
    expect(reply.reason).toContain(
      "`specty check --changed` fails; fix it before ending the turn:",
    );
    expect(reply.reason).toContain("FAIL scope\n  lib/other.ts outside the scope of the spec");
  });
});
