// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, CONFIG, cli, folderOf, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** The configuration with the stray comma that reached main (P130). */
const BROKEN = CONFIG().replace(
  "  worktrees: false\n",
  '  worktrees: false\n  branchPerChange: "true,"\n',
);

const PROTECTED = "`.specty/config.yaml` lo gestiona Specty; no se edita a mano.";

/** Codex's hook before a shell command of the conversation `session`, working in `cwd`. */
const codexBash = (cwd: string, session: string, command: string) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

/**
 * The hook of a tool that cannot run the input the guard gives back (OpenCode's plugin without
 * `redirects`): the guard blocks what would go elsewhere instead of moving it.
 */
const older = (cwd: string, session: string, tool: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "opencode"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      tool_use_id: "c1",
      tool_name: tool,
      tool_input: input,
    }),
  });

/** That tool's `apply_patch` adding `path`. */
const add = (cwd: string, session: string, path: string) =>
  older(cwd, session, "apply_patch", {
    patchText: ["*** Begin Patch", `*** Add File: ${path}`, "+x", "*** End Patch"].join("\n"),
  });

/** A change in its own folder, entered with `specty enter`, whose configuration then broke. */
async function enteredThenBroken() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const folder = folderOf(root);
  expect((await codexBash(root, "s1", `specty enter ${CHANGE}`)).code).toBe(0);
  // As the merge of main brought it into a change's folder (P130, P131).
  await writeFiles(folder, { ".specty/config.yaml": BROKEN });
  return { root, folder };
}

describe("the guard in a change's folder whose configuration is not valid", () => {
  it("AC1: judges a file of the folder a conversation entered by its change's rules", async () => {
    const { root, folder } = await enteredThenBroken();
    const spec = await add(root, "s1", join(folder, SPEC_PATH));
    expect(spec.err).not.toContain("otra worktree");
    expect(spec.code).toBe(0);
    const code = await add(root, "s1", join(folder, "src/nuevo.ts"));
    expect(code.code).toBe(2);
    expect(code.err).not.toContain("otra worktree");
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("AC2: keeps its configuration protected and the conversation's commands in it", async () => {
    const { root, folder } = await enteredThenBroken();
    const config = await add(root, "s1", join(folder, ".specty/config.yaml"));
    expect(config.code).toBe(2);
    expect(config.err).toContain(PROTECTED);
    const elsewhere = await older(root, "s1", "bash", { command: "pnpm test" });
    expect(elsewhere.code).toBe(2);
    expect(elsewhere.err).toContain(`SIGUIENTE: ejecútalo allí: \`cd '${folder}' && pnpm test\`.`);
  });

  it("AC3: judges an agent working inside it with the main folder's configuration", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const folder = folderOf(root);
    await writeFiles(folder, { ".specty/config.yaml": BROKEN });
    // Claude Code after `EnterWorktree`: its session works in the change's folder.
    const write = (path: string) =>
      cli(folder, ["guard", "--tool", "claude-code"], {
        stdin: JSON.stringify({
          cwd: folder,
          session_id: "s1",
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: join(folder, path) },
        }),
      });
    const config = await write(".specty/config.yaml");
    expect(config.code).toBe(2);
    expect(config.err).toContain(PROTECTED);
    const code = await write("src/nuevo.ts");
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });
});
