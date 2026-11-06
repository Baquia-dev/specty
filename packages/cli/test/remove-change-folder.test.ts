// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CHANGE, cli, git, inWorktree } from "./support";

/** Claude Code's hook before a Bash command, with its tool working in `cwd`. */
const bash = (cwd: string, command: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command } }),
  });

const REASON = `es la carpeta del cambio ${CHANGE}, que sigue abierto: se queda mientras no se cierre ni se cancele, y quitarla con \`--force\` perdería lo que tiene sin commit.`;
const NEXT = `SIGUIENTE: no la quites. Si ese cambio ya no sigue, \`specty cancel ${CHANGE}\` guarda en su rama lo que tiene sin commit y quita la carpeta; al terminarlo, \`specty close\` la quita.`;

describe("`git worktree remove` on a change's folder", () => {
  it("AC1: is blocked for the folder of an open change, however the command names it", async () => {
    const { root, folder } = await inWorktree();
    for (const [cwd, command] of [
      [root, `git worktree remove --force .worktrees/${CHANGE}`],
      [root, `git worktree remove '${folder}'`],
      [root, `cd .worktrees && git worktree remove -f ${CHANGE}`],
      [root, `git -C .worktrees worktree remove ${CHANGE}`],
      [root, `git worktree remove ${CHANGE}`],
      [folder, "git worktree remove --force ."],
    ] as const) {
      const denied = await bash(cwd, command);
      expect(denied.code, command).toBe(2);
      expect(denied.err, command).toContain(`\`${folder}\` ${REASON}`);
      expect(denied.err, command).toContain(NEXT);
    }
    expect(await exists(folder)).toBe(true);
  });

  it("AC3: lets through removing a worktree that is no open change's folder", async () => {
    const { root } = await inWorktree();
    const plain = join(root, ".worktrees", "suelta");
    git(root, "worktree", "add", "-b", "suelta", plain);
    for (const command of [
      "git worktree remove --force .worktrees/suelta",
      `git worktree remove '${plain}'`,
      "git worktree remove suelta",
      "git worktree remove nada",
      'git worktree remove "$W"',
    ]) {
      expect((await bash(root, command)).code, command).toBe(0);
    }
  });
});
