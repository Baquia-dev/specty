// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

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

  it("leaves Claude Code's end of turn silent when Devin runs it, since Devin's own answers (AC2)", async () => {
    const root = await failing();
    const run = await cli(root, ["hook", "agent-stop", "claude-code"], {
      stdin: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
      env: { DEVIN_PROJECT_DIR: root },
    });
    expect(run).toMatchObject({ code: 0, out: "" });
    // Devin's own end of turn still sends the turn back.
    const devin = await stop(root, "windsurf", {
      hook_event_name: "Stop",
      stop_hook_active: false,
    });
    expect(JSON.parse(devin.out).decision).toBe("block");
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

  it("is offered by check --install next to each agent's guard, once, in the project (AC4, AC9)", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "specty-codex-home-"));
    const hooks = (tool: string, event: string) =>
      `${JSON.stringify({ hooks: { [event]: [{ hooks: [{ type: "command", command: `specty guard --tool ${tool}` }] }] } }, null, 2)}\n`;
    // A guard an earlier Specty left in the user's configuration: it stays as it is.
    await writeFiles(codexHome, { "hooks.json": hooks("codex", "PreToolUse") });
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n  preCommit: true\n`,
      ".claude/settings.json": hooks("claude-code", "PreToolUse"),
      ".cursor/hooks.json": `${JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: "specty guard --tool cursor" }] } }, null, 2)}\n`,
      ".codex/hooks.json": hooks("codex", "PreToolUse"),
    });
    const env = { CODEX_HOME: codexHome };
    const plan = await cli(root, ["check", "--install", "--dry-run"], { env });
    expect(plan.out).toContain(".claude/settings.json (modificar)");
    expect(plan.out).toContain("specty hook agent-stop claude-code");
    expect(plan.out).toContain(".cursor/hooks.json (modificar)");
    expect(plan.out).toContain("specty hook agent-stop cursor");
    expect(plan.out).toContain(".codex/hooks.json (modificar)");
    expect(plan.out).not.toContain(codexHome);
    const run = await cli(root, ["check", "--install"], { env, terminal: person() });
    expect(run.code).toBe(0);
    const claude = JSON.parse(await read(root, ".claude/settings.json"));
    expect(claude.hooks.Stop).toEqual([
      { hooks: [{ type: "command", command: "specty hook agent-stop claude-code", timeout: 600 }] },
    ]);
    expect(claude.hooks.PreToolUse).toHaveLength(1);
    expect(JSON.parse(await read(root, ".cursor/hooks.json")).hooks.stop).toEqual([
      { command: "specty hook agent-stop cursor" },
    ]);
    expect(JSON.parse(await read(root, ".codex/hooks.json")).hooks.Stop[0].hooks[0].command).toBe(
      "specty hook agent-stop codex",
    );
    expect(await read(codexHome, "hooks.json")).toBe(hooks("codex", "PreToolUse"));
    const again = await cli(root, ["check", "--install", "--dry-run"], { env });
    expect(again.out).not.toContain("agent-stop");
  });

  it("turns on OpenCode's end of turn in its plugin, and init keeps it (AC2)", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n  preCommit: true\n`,
      "opencode.json": "{}\n",
    });
    await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    const plugin = () => read(root, ".opencode/plugins/specty.js");
    expect(await plugin()).toContain("const STOP = null;");
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out).toContain(".opencode/plugins/specty.js (modificar)");
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    expect(await plugin()).toContain("const STOP = 600;");
    await cli(root, ["init", "--tools", "opencode"]);
    expect(await plugin()).toContain("const STOP = 600;");
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain(
      ".opencode/plugins/specty.js",
    );
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
