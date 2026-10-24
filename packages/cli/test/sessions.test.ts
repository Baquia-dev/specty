// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, person, read, tempRepo } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const THIRD = CHANGE.replace("saludo-personalizado", "tercero");

/** Claude Code's hook before `EnterWorktree`, run from `cwd`, for the agent session `session`. */
const enter = (cwd: string, path: string, session?: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      tool_name: "EnterWorktree",
      tool_input: { path },
      ...(session !== undefined ? { session_id: session } : {}),
    }),
  });

/** The same hook for `EnterWorktree` by name, as Claude Code sends it to skip the prompt. */
const enterByName = (cwd: string, name: string, session: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      tool_name: "EnterWorktree",
      tool_input: { name },
      session_id: session,
    }),
  });

/** A repository with two open changes, each in its own worktree. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

describe("one worktree per agent session", () => {
  it("binds a session to the first worktree it enters and keeps it out of others (AC1, AC2, AC4)", async () => {
    const { root, first, second } = await twoChanges();
    expect((await enter(root, first, "s1")).code).toBe(0);
    expect((await enter(first, first, "s1")).code).toBe(0);
    const denied = await enter(first, second, "s1");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
    );
    expect(denied.err).toContain(`abre otra sesión en \`${second}\` para trabajar en ese.`);
    // Another session is free, and an event without a session is not judged.
    expect((await enter(root, second, "s2")).code).toBe(0);
    expect((await enter(first, second)).code).toBe(0);
  });

  it("frees the session once its change is finished or its folder is gone (AC3)", async () => {
    const { root, first, second } = await twoChanges();
    await enter(root, first, "s1");
    await cli(first, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect((await enter(first, second, "s1")).code).toBe(0);
    // Now bound to the second change, which is open.
    expect((await enter(second, first, "s1")).code).toBe(2);
    expect((await cli(root, ["new", "--worktree", "Tercero"])).code).toBe(0);
    const third = folderOf(root, THIRD);
    await enter(root, third, "s3");
    git(root, "worktree", "remove", "--force", third);
    expect((await enter(root, second, "s3")).code).toBe(0);
  });

  it("binds a session that enters by name to the change's folder (AC4)", async () => {
    const { root, first, second } = await twoChanges();
    expect((await enterByName(root, CHANGE, "s1")).code).toBe(0);
    const denied = await enter(first, second, "s1");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto)`,
    );
    // Any other name is Claude Code's own worktree, which the session may not enter either.
    expect((await enterByName(first, "explorar", "s1")).code).toBe(2);
  });

  it("is installed by init in Claude Code's hook (AC5)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
    const settings = JSON.parse(await read(root, ".claude/settings.local.json"));
    expect(settings.hooks.PreToolUse[0].matcher).toBe(
      "Edit|MultiEdit|Write|NotebookEdit|Bash|EnterWorktree",
    );
  });
});
