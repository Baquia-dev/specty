// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, read, tempRepo } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
/** The lines of the clone's own ignore file that ignore the worktrees' folder. */
const ignoring = async (root: string) =>
  (await read(root, ".git/info/exclude")).split("\n").filter((line) => line === "/.worktrees/");

describe("the changes' worktrees inside the project", () => {
  it("AC1: new puts each change in .worktrees/<id>, ignored once in the clone", async () => {
    const root = await tempRepo(APP);
    const created = await cli(root, ["new", "--worktree", "Saludo personalizado"]);
    expect(created.code).toBe(0);
    const folder = join(root, ".worktrees", CHANGE);
    expect(folderOf(root)).toBe(folder);
    expect(created.out).toContain(`(rama specty/${CHANGE}) en ${folder}, desde main`);
    expect(existsSync(join(folder, ".git"))).toBe(true);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(await ignoring(root)).toHaveLength(1);
    expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
    expect(existsSync(join(root, ".worktrees", OTHER))).toBe(true);
    expect(await ignoring(root)).toHaveLength(1);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("AC2: the guard keeps a session of the main folder out of a change's files there", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const folder = folderOf(root);
    const write = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        cwd: root,
        tool_name: "Write",
        tool_input: { file_path: join(folder, "src/app.ts"), content: "x\n" },
      }),
    });
    expect(write.code).toBe(2);
    expect(write.err).toContain(
      `\`${join(folder, "src/app.ts")}\` está en otra worktree (\`${folder}\`, rama specty/${CHANGE}): es de otro cambio.`,
    );
  });

  it("AC3: Antigravity with the main folder as its workspace enters a change on its own", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const enter = await cli(root, ["guard", "--tool", "antigravity", "--event", "PreToolUse"], {
      stdin: JSON.stringify({
        conversationId: "c1",
        workspacePaths: [root],
        toolCall: {
          name: "run_command",
          args: { CommandLine: `specty enter ${CHANGE}`, Cwd: root },
        },
        stepIdx: 1,
      }),
    });
    expect(enter.code).toBe(0);
    expect(JSON.parse(enter.out).decision).toBe("allow");
  });

  it("AC4: a change still open in the old folder beside the project keeps working", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const old = join(dirname(root), `${basename(root)}.worktrees`, CHANGE);
    // git moves a worktree only into a folder that exists.
    await mkdir(dirname(old), { recursive: true });
    git(root, "worktree", "move", folderOf(root), old);
    const status = await cli(root, ["status"]);
    expect(status.out).toContain(CHANGE);
    expect(status.out).toContain(`${basename(root)}.worktrees/${CHANGE}`);
    const enter = await cli(root, ["enter", CHANGE]);
    expect(enter.code).toBe(0);
    expect(enter.out).toContain(old);
  });
});
