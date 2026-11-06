// SPDX-License-Identifier: Apache-2.0
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  cli,
  git,
  inWorktree,
  NOW,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** Claude Code's hook before an agent action, with its tool working in `cwd`. */
const claude = (cwd: string, tool: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd, tool_name: tool, tool_input: input }),
  });

/** Codex's hook before a tool call of the conversation `session`, working in `cwd`. */
const codex = (cwd: string, session: string, tool: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({ cwd, session_id: session, hook_event_name: "PreToolUse", ...tool }),
  });

const GHOST = "que ya no es la carpeta de ningún cambio";

/** A repository whose change was cancelled from inside its folder, which went with it. */
async function cancelled() {
  const { root, folder } = await inWorktree();
  const done = await cli(folder, ["cancel", "--reason", "Ya no"], { terminal: person() });
  expect(done.code).toBe(0);
  expect(await exists(folder)).toBe(false);
  return { root, folder };
}

describe("a write in a ghost folder", () => {
  it("AC1: is denied from a file tool, says the folder is no change's and how to carry on", async () => {
    const { root, folder } = await cancelled();
    const path = join(folder, "src/app.ts");
    const denied = await claude(root, "Write", { file_path: path, content: "x" });
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `\`${path}\` está en \`${folder}\`, que ya no es la carpeta de ningún cambio: git no la tiene como worktree (se quitó al cerrar o cancelar su cambio, o se borró), y escribir allí la volvería a crear sin git.`,
    );
    expect(denied.err).toContain(
      `SIGUIENTE: sal de ella si trabajas allí (en Claude Code, \`ExitWorktree\`) y sigue en \`${root}\`; para otro cambio, \`specty new "<título>"\`.`,
    );
    // Once something made it again, also from a tool that works inside it; reading stays free.
    await mkdir(join(folder, "src"), { recursive: true });
    const inside = await claude(folder, "Edit", { file_path: path });
    expect(inside.code).toBe(2);
    expect(inside.err).toContain(GHOST);
    expect((await claude(root, "Read", { file_path: path })).code).toBe(0);
  });

  it("AC1: is denied from a command that writes or deletes, in `.worktrees/` or the sibling folder", async () => {
    const { root, folder } = await cancelled();
    const written = await claude(root, "Bash", { command: `echo x > ${folder}/src/app.ts` });
    expect(written.code).toBe(2);
    expect(written.err).toContain(GHOST);
    const sibling = `${root}.worktrees/viejo`;
    const removed = await claude(root, "Bash", { command: `rm -rf ${sibling}/src` });
    expect(removed.code).toBe(2);
    expect(removed.err).toContain(
      `\`${sibling}/src\` está en \`${sibling}\`, que ya no es la carpeta de ningún cambio:`,
    );
    const patch = ["*** Begin Patch", `*** Add File: ${folder}/src/x.ts`, "+x", "*** End Patch"];
    const patched = await codex(root, "s1", {
      tool_name: "apply_patch",
      tool_input: { command: patch.join("\n") },
    });
    expect(patched.code).toBe(2);
    expect(patched.err).toContain(GHOST);
  });

  it("AC1: proposes `specty restore` in the folder of an open change that lost it", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    await rm(folder, { recursive: true, force: true });
    git(root, "worktree", "prune");
    const path = join(folder, "src/app.ts");
    const denied = await claude(root, "Write", { file_path: path, content: "x" });
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `\`${path}\` está en \`${folder}\`, que ya no es una worktree de git: es la carpeta del cambio ${CHANGE}, que sigue abierto en su rama, y escribir allí la volvería a crear sin git.`,
    );
    expect(denied.err).toContain(
      `SIGUIENTE: recupérala con \`specty restore ${CHANGE}\` y sigue su salida, que dice cómo volver a ella.`,
    );
  });

  it("AC1: is denied to a conversation that entered another change's folder, not moved there", async () => {
    const { root, folder } = await inWorktree();
    const ghost = join(root, ".worktrees", "20260101-cerrado");
    expect((await codex(root, "s1", bash(`specty enter ${CHANGE}`))).code).toBe(0);
    const patch = ["*** Begin Patch", `*** Add File: ${ghost}/src/x.ts`, "+x", "*** End Patch"];
    const denied = await codex(root, "s1", {
      tool_name: "apply_patch",
      tool_input: { command: patch.join("\n") },
    });
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(`\`${ghost}/src/x.ts\` está en \`${ghost}\`, ${GHOST}`);
    expect(denied.err).not.toContain(folder);
  });

  it("AC1: does not hold a conversation bound to a ghost folder there", async () => {
    const root = await tempRepo(APP);
    const ghost = join(root, ".worktrees", "20260101-cerrado");
    await mkdir(ghost, { recursive: true });
    await writeFiles(root, {
      ".git/common/specty/sessions/s1.json": JSON.stringify({
        folder: ghost,
        at: NOW.toISOString(),
      }),
    });
    // Neither denied for running outside it nor sent there with a `cd`.
    const command = await codex(root, "s1", bash("ls"));
    expect(command.code).toBe(0);
    expect(`${command.out}${command.err}`).not.toContain(ghost);
  });
});

describe("a write outside the ghost folders", () => {
  it("AC2: in a worktree of `.worktrees/` git knows, is judged as before, also when its folder is gone", async () => {
    const { root, folder } = await inWorktree();
    const path = join(folder, "src/app.ts");
    const foreign = `\`${path}\` está en otra worktree (\`${folder}\`, rama specty/${CHANGE}): es de otro cambio.`;
    const write = await claude(root, "Write", { file_path: path, content: "x" });
    expect(write.code).toBe(2);
    expect(write.err).toContain(foreign);
    expect(write.err).not.toContain(GHOST);
    // From inside it, its change's rules judge it: the spec is still a draft.
    const own = await claude(folder, "Write", { file_path: path, content: "x" });
    expect(own.code).toBe(2);
    expect(own.err).toContain(`El cambio ${CHANGE} está en fase draft`);
    // Git still lists it without its folder: it is still another change's.
    await rm(folder, { recursive: true, force: true });
    expect((await claude(root, "Write", { file_path: path, content: "x" })).err).toContain(foreign);
  });

  it("AC2: in a worktree of the sibling folder git knows, or outside both folders, is judged as before", async () => {
    const root = await tempRepo(APP);
    const legacy = `${root}.worktrees/legacy`;
    git(root, "worktree", "add", "-q", "-b", "legacy", legacy);
    const there = await claude(root, "Write", { file_path: join(legacy, "src/app.ts") });
    expect(there.err).toContain("está en otra worktree");
    expect(there.err).not.toContain(GHOST);
    const outside = await claude(root, "Write", { file_path: join(dirname(root), "fuera.ts") });
    expect(outside.code).toBe(0);
    const own = await claude(root, "Write", { file_path: join(root, "src/app.ts") });
    expect(own.err).toContain("No hay un cambio activo y `src/app.ts` es código gobernado");
  });
});

/** Codex's shell tool running `command`. */
function bash(command: string): Record<string, unknown> {
  return { tool_name: "Bash", tool_input: { command } };
}
