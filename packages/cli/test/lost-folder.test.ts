// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, git, inWorktree, person, read, SPEC, SPEC_PATH, writeFiles } from "./support";

/** A repository whose change, approved in its own folder, lost that folder. */
async function lostFolder({ prune = false } = {}) {
  const made = await inWorktree();
  await writeFiles(made.folder, { [SPEC_PATH]: SPEC });
  expect((await cli(made.folder, ["propose"])).code).toBe(0);
  const approved = await cli(made.folder, ["approve"], {
    terminal: person({ choose: ["confirm"] }),
  });
  expect(approved.code).toBe(0);
  await rm(made.folder, { recursive: true, force: true });
  if (prune) git(made.root, "worktree", "prune");
  return made;
}

/** What Claude Code tells the commands that conversation `session` runs. */
const claude = (session = "s1") => ({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session });

/** Where the guard keeps the folder conversation `session` works in. */
const BINDING = (session: string) => `.git/common/specty/sessions/${session}.json`;

/** Claude Code's `WorktreeCreate` with `name`, run from `cwd`. */
const worktreeCreate = (cwd: string, name: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ session_id: "s1", cwd, hook_event_name: "WorktreeCreate", name }),
  });

const listed = (root: string) => git(root, "worktree", "list", "--porcelain");

describe("`next` with no change", () => {
  it("AC1: lists the open changes without their folder, with how to bring it back", async () => {
    const { root } = await lostFolder();
    const next = (await cli(root, ["next"])).out;
    expect(next).toContain(
      `CAMBIOS SIN CARPETA:\n  ${CHANGE} · implementing — Saludo personalizado`,
    );
    expect(next).toContain("recupera su carpeta con `specty restore <id>`");
    expect(next).toContain("SIGUIENTE: ejecuta `specty new");
  });

  it("AC1: lists none once the folder is back", async () => {
    const { root } = await lostFolder();
    expect((await cli(root, ["restore", CHANGE])).code).toBe(0);
    expect((await cli(root, ["next"])).out).not.toContain("CAMBIOS SIN CARPETA");
  });
});

describe("Claude Code's `EnterWorktree` by the id of a change without its folder", () => {
  for (const prune of [false, true]) {
    it(`AC2: is refused, creating no worktree${prune ? ", once git no longer lists it" : ""}`, async () => {
      const { root } = await lostFolder({ prune });
      const before = listed(root);
      const created = await worktreeCreate(root, CHANGE);
      expect(created.code).not.toBe(0);
      expect(created.out).toBe("");
      expect(created.err).toContain(
        `La carpeta del cambio ${CHANGE} se perdió; el cambio sigue en su rama. Recupérala con \`specty restore ${CHANGE}\``,
      );
      expect(listed(root)).toBe(before);
      expect(existsSync(join(root, ".claude", "worktrees", CHANGE))).toBe(false);
    });
  }
});

describe("`specty enter` of a change without its folder", () => {
  it("AC3: asks to restore the folder and enter again, without binding the conversation", async () => {
    const { root } = await lostFolder();
    const command = `specty enter ${CHANGE}`;
    const judged = await cli(root, ["guard", "--tool", "codex"], {
      stdin: JSON.stringify({
        cwd: root,
        session_id: "c1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
      }),
    });
    expect(judged.code).toBe(0);
    expect(existsSync(join(root, BINDING("c1")))).toBe(false);
    const entered = await cli(root, ["enter", CHANGE]);
    expect(entered.code).not.toBe(0);
    expect(entered.out).toContain(
      `La carpeta del cambio ${CHANGE} se perdió; el cambio sigue en su rama.`,
    );
    expect(entered.out).toContain(
      `SIGUIENTE: recupérala con \`specty restore ${CHANGE}\` y vuelve a ejecutar \`specty enter ${CHANGE}\`.`,
    );
  });
});

describe("a conversation bound to a folder that was lost", () => {
  /** Conversation s1 entered the change's folder before it was lost. */
  async function boundAndLost({ prune = false } = {}) {
    const made = await inWorktree();
    await writeFiles(made.folder, { [SPEC_PATH]: SPEC });
    expect((await cli(made.folder, ["propose"])).code).toBe(0);
    const approved = await cli(made.folder, ["approve"], {
      terminal: person({ choose: ["confirm"] }),
    });
    expect(approved.code).toBe(0);
    await writeFiles(made.root, {
      [BINDING("s1")]: JSON.stringify({ folder: made.folder, at: new Date().toISOString() }),
    });
    await rm(made.folder, { recursive: true, force: true });
    if (prune) git(made.root, "worktree", "prune");
    return made;
  }

  it("AC4: `next` in the main folder asks it to restore the folder, not to create a change", async () => {
    const { root, folder } = await boundAndLost();
    const next = (await cli(root, ["next"], { env: claude() })).out;
    expect(next).toContain("TU CAMBIO:");
    expect(next).toContain(
      `Esta conversación trabaja en el cambio ${CHANGE} («Saludo personalizado»), cuya carpeta ${folder} se perdió; el cambio sigue en su rama.`,
    );
    expect(next).toContain(
      `SIGUIENTE: recupera la carpeta con \`specty restore ${CHANGE}\` y sigue su salida, que dice cómo volver a ella.`,
    );
    expect(next).not.toContain("specty new");
  });

  it("AC4: also once git no longer lists the folder, and at its `SessionStart`", async () => {
    const { root } = await boundAndLost({ prune: true });
    const started = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        session_id: "s1",
        cwd: root,
        hook_event_name: "SessionStart",
        source: "resume",
      }),
    });
    expect(started.code).toBe(0);
    expect(started.out).toContain(`se perdió; el cambio sigue en su rama.`);
    expect(started.out).toContain(`specty restore ${CHANGE}`);
  });

  it("AC4: another conversation hears the card with no change, with the list", async () => {
    const { root } = await boundAndLost();
    const next = (await cli(root, ["next"], { env: claude("s2") })).out;
    expect(next).not.toContain("TU CAMBIO");
    expect(next).toContain("CAMBIOS SIN CARPETA");
    expect(JSON.parse(await read(root, BINDING("s1"))).folder).toContain(CHANGE);
  });
});
