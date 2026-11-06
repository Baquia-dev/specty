// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, read, tempRepo } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");

/** Two changes, each in its own folder. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

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

const boundFolder = async (root: string, session: string): Promise<string> =>
  JSON.parse(await read(root, `.git/common/specty/sessions/${session}.json`)).folder;

describe("session_move of OpenCode's Code Mode, as the guard judges it", () => {
  it("AC1: blocks moving a conversation that works in an open change to another folder, and lets it move to its own", async () => {
    const { root, first, second } = await twoChanges();
    const entered = await before(root, "s1", "shell", { command: `specty enter ${CHANGE}` });
    expect(entered.code).toBe(0);
    expect(await boundFolder(root, "s1")).toBe(first);
    const moved = await before(root, "s1", "opencode_session_move", { directory: second });
    expect(moved.code).toBe(2);
    expect(moved.err).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
    );
    expect(await boundFolder(root, "s1")).toBe(first);
    const home = await before(root, "s1", "opencode_session_move", { directory: first });
    expect(home.code).toBe(0);
  });

  it("AC2: lets a conversation without an open change move into a change's folder, also by a relative path, and binds it there", async () => {
    const { root, first, second } = await twoChanges();
    const moved = await before(root, "s2", "opencode_session_move", { directory: second });
    expect(moved.code).toBe(0);
    expect(await boundFolder(root, "s2")).toBe(second);
    const relative = await before(root, "s3", "opencode_session_move", {
      directory: `.worktrees/${CHANGE}`,
    });
    expect(relative.code).toBe(0);
    expect(await boundFolder(root, "s3")).toBe(first);
  });
});
