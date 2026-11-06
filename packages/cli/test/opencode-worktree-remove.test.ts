// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, git, inWorktree } from "./support";

/** What Specty's plugin sends the guard before OpenCode runs `tool` for `session`. */
const before = (root: string, session: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "opencode"], {
    stdin: JSON.stringify({
      cwd: root,
      session_id: session,
      tool_use_id: "c1",
      tool_name: tool,
      tool_input: input,
      redirects: true,
    }),
  });

const REASON = `es la carpeta del cambio ${CHANGE}, que sigue abierto: se queda mientras no se cierre ni se cancele, y quitarla con \`--force\` perdería lo que tiene sin commit.`;

describe("worktree_remove of OpenCode's Code Mode, as the guard judges it", () => {
  it("AC2: blocks removing the folder of an open change, also forced or by a relative path", async () => {
    const { root, folder } = await inWorktree();
    for (const input of [
      { directory: folder },
      { directory: folder, force: true },
      { directory: `.worktrees/${CHANGE}`, force: true },
    ]) {
      const denied = await before(root, "s1", "opencode_worktree_remove", input);
      expect(denied.code, JSON.stringify(input)).toBe(2);
      expect(denied.err, JSON.stringify(input)).toContain(`\`${folder}\` ${REASON}`);
      expect(denied.err, JSON.stringify(input)).toContain(`\`specty cancel ${CHANGE}\``);
    }
  });

  it("AC3: lets through removing a worktree that is no open change's folder, or a call without a folder", async () => {
    const { root } = await inWorktree();
    const plain = join(root, ".worktrees", "suelta");
    git(root, "worktree", "add", "-b", "suelta", plain);
    for (const input of [
      { directory: plain, force: true },
      { directory: ".worktrees/suelta" },
      {},
    ]) {
      const passed = await before(root, "s2", "opencode_worktree_remove", input);
      expect(passed.code, JSON.stringify(input)).toBe(0);
    }
  });
});
