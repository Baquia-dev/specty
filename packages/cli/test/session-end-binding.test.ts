// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { cli, git, inWorktree, NOW, person, read, toClosing, writeFiles } from "./support";

/** Where the guard keeps the folder the conversation `session` works in. */
const BINDING = (session: string) => `.git/common/specty/sessions/${session}.json`;
const WORKING = (folder: string) => `QUEDAN:\n  ${folder}: una sesión de agente trabaja en ella.`;

/** Claude Code's hook for an event of the conversation `session`, with its tool in `cwd`. */
const claude = (cwd: string, session: string, event: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd, session_id: session, ...event }),
  });

/** Claude Code's `SessionEnd` of the conversation `session`, for `reason`. */
const ended = (cwd: string, session: string, reason = "prompt_input_exit") =>
  claude(cwd, session, { hook_event_name: "SessionEnd", reason });

/** Claude Code's `SessionStart` when the conversation `session` resumes. */
const resumed = (cwd: string, session: string) =>
  claude(cwd, session, { hook_event_name: "SessionStart", source: "resume" });

/**
 * A change closed (delegated mode) whose folder stayed, because it was locked then, and the
 * conversation s1 bound to that folder, as the guard records it.
 */
async function boundLeftover() {
  const { root, folder } = await inWorktree();
  await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  await toClosing(folder);
  git(root, "worktree", "lock", folder);
  expect((await cli(folder, ["close"])).out).toContain(`La carpeta ${folder} queda: `);
  git(root, "worktree", "unlock", folder);
  await writeFiles(root, { [BINDING("s1")]: JSON.stringify({ folder, at: NOW.toISOString() }) });
  return { root, folder };
}

describe("the end of a conversation, for the clean-up", () => {
  it("AC3: frees the folder it was bound to, and keeps the binding marked as ended", async () => {
    const { root, folder } = await boundLeftover();
    expect((await cli(root, ["prune"])).out).toContain(WORKING(folder));
    expect(await ended(root, "s1")).toMatchObject({ code: 0, out: "", err: "" });
    expect(JSON.parse(await read(root, BINDING("s1")))).toEqual({
      folder,
      at: NOW.toISOString(),
      ended: NOW.toISOString(),
    });
    const pruned = await cli(root, ["prune"]);
    expect(pruned.out).toContain("CARPETAS BORRADAS:");
    expect(pruned.out).toContain(`  ${folder}`);
    expect(pruned.out).not.toContain(WORKING(folder));
    expect(await exists(folder)).toBe(false);
  });

  it("AC3: counts again once that conversation resumes, and another one's end frees nothing", async () => {
    const { root, folder } = await boundLeftover();
    expect((await ended(root, "s1", "clear")).code).toBe(0);
    expect((await resumed(root, "s1")).code).toBe(0);
    expect(JSON.parse(await read(root, BINDING("s1")))).toEqual({ folder, at: NOW.toISOString() });
    expect((await ended(root, "s2")).code).toBe(0);
    expect((await cli(root, ["prune"])).out).toContain(WORKING(folder));
    expect(await exists(folder)).toBe(true);
  });

  it("AC3: still takes the resumed conversation back to its change's folder with `next`", async () => {
    const { root, folder } = await inWorktree();
    const entered = await claude(root, "s1", {
      tool_name: "EnterWorktree",
      tool_input: { path: folder },
    });
    expect(entered.code).toBe(0);
    expect((await ended(root, "s1")).code).toBe(0);
    const back = await resumed(root, "s1");
    expect(back.code).toBe(0);
    expect(back.out).toContain("TU CAMBIO:");
    expect(back.out).toContain(`SIGUIENTE: vuelve a ${folder}:`);
  });
});
