// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, NOW, tempRepo, writeFiles } from "./support";

/** A repository whose changes each get a folder of their own, as `new` makes them by default. */
const IN_FOLDERS = {
  ...APP,
  ".specty/config.yaml": CONFIG().replace("worktrees: false", "worktrees: true"),
};

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** Claude Code running a command in its conversation `session`, which it tells in its environment. */
const inConversation = (session: string) => ({
  env: { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session },
});

/** Claude Code's hook before the conversation `session` runs `command` in `cwd`. */
const bash = (cwd: string, session: string, command: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

/**
 * Claude Code's `SessionStart` when the conversation `session` starts in `cwd`, or comes back from
 * `source`, with no mark of Claude Code in the hook's environment.
 */
const started = (cwd: string, session: string, source = "startup") =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ session_id: session, cwd, hook_event_name: "SessionStart", source }),
  });

/** A repository whose memory has P1 to P5 and no fronts. */
async function withEntries(): Promise<string> {
  const root = await tempRepo(APP);
  for (const text of ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]) {
    expect((await cli(root, ["memory", "add", text], CLAUDE)).code).toBe(0);
  }
  return root;
}

/** Fronts B, with P4 and P2 in that order, ui, with P5, and docs, with none. */
async function addFronts(root: string): Promise<void> {
  const run = (...args: string[]) => cli(root, args, CLAUDE);
  expect((await run("front", "add", "B", "Guard.")).code).toBe(0);
  expect((await run("front", "add", "ui", "Servidor y UI.")).code).toBe(0);
  expect((await run("front", "add", "docs", "Documentación.")).code).toBe(0);
  expect((await run("front", "assign", "B", "P4", "P2")).code).toBe(0);
  expect((await run("front", "assign", "ui", "P5")).code).toBe(0);
}

/** The lines of `text` under the section `title`, up to the next section or SIGUIENTE. */
const sectionOf = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

const memoryOf = (text: string) => sectionOf(text, "MEMORIA DE SPECTY");

describe("the card of Claude Code's guard with no mark of Claude Code in its environment", () => {
  it("AC1: is the card of `next` in Claude Code, with its brief, at the start and after a compaction", async () => {
    const root = await tempRepo(IN_FOLDERS);
    const next = (await cli(root, ["next"], inConversation("s4"))).out;
    expect(next).toContain("ENCARGO:");
    expect((await cli(root, ["next"])).out).not.toBe(next);
    expect((await started(root, "s4")).out).toBe(next);
    expect((await started(root, "s4", "compact")).out).toBe(next);
  });

  it("asks for `specty new` in the session when `new` gives no change a folder of its own (P263)", async () => {
    const root = await tempRepo(APP);
    for (const git of ["worktrees: false", "branchPerChange: false"]) {
      const config = CONFIG().replace("worktrees: false", git);
      await writeFiles(root, { ".specty/config.yaml": config });
      const next = (await cli(root, ["next"], inConversation("s4"))).out;
      expect(next, git).not.toContain("ENCARGO:");
      expect(next, git).toContain('SIGUIENTE: ejecuta `specty new "<título>" --request');
      expect((await started(root, "s4")).out, git).toBe(next);
    }
  });
});

describe("the card with no active change and the fronts", () => {
  it("AC1: shows the conversation that holds a front only that front's free entries, in order", async () => {
    const root = await withEntries();
    await addFronts(root);
    expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
    const next = await cli(root, ["next"], inConversation("s1"));
    expect(memoryOf(next.out).slice(0, 3)).toEqual([
      "Las primeras entradas libres de tu frente, B, en su orden:",
      "P4 · pendiente · Cuatro",
      "P2 · pendiente · Dos",
    ]);
    for (const outside of ["P1", "P3", "P5"]) expect(next.out).not.toContain(`${outside} ·`);
    expect(next.out).not.toContain("`specty memory`");
    // The guard knows the conversation by its event, as when the session starts, and its tool by
    // its `--tool`, though the hook's environment does not say it (ARCHITECTURE §7).
    expect((await started(root, "s1")).out).toBe(next.out);
  });

  it("AC1: gives the other conversations no entry, also when it cannot tell who asks", async () => {
    const root = await withEntries();
    await addFronts(root);
    expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
    const other = await cli(root, ["next"], inConversation("s2"));
    expect(memoryOf(other.out)).toEqual([]);
    for (const id of ["P1", "P2", "P3", "P4", "P5"]) expect(other.out).not.toContain(`${id} ·`);
    expect(other.out).not.toContain("`specty front`");
    expect(memoryOf((await cli(root, ["next"])).out)).toEqual([]);
    expect((await started(root, "s2")).out).toBe(other.out);
    expect((await cli(root, ["next"], CLAUDE)).out).toBe(other.out);
  });

  it("AC1: tells the conversation whose front has no free entry to ask the person", async () => {
    const root = await withEntries();
    await addFronts(root);
    expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
    expect((await bash(root, "s3", "specty front take docs")).code).toBe(0);
    const next = await cli(root, ["next"], inConversation("s3"));
    expect(memoryOf(next.out)).toEqual([
      "Tu frente, docs, no tiene ninguna entrada libre: pregúntale a la persona qué sigue.",
    ]);
    for (const id of ["P1", "P2", "P3", "P4", "P5"]) expect(next.out).not.toContain(`${id} ·`);
  });

  it("AC1: is the card of before while no front has a live owner", async () => {
    const root = await withEntries();
    const before = (await cli(root, ["next"], inConversation("s1"))).out;
    await addFronts(root);
    expect((await cli(root, ["next"], inConversation("s1"))).out).toBe(before);
    // Conversation s1 took B 61 minutes ago and has not stepped since.
    const at = new Date(NOW.getTime() - 61 * 60_000).toISOString();
    await writeFiles(root, {
      ".git/common/specty/fronts/B.json": JSON.stringify({
        front: "B",
        tool: "claude-code",
        conversation: "s1",
        at,
      }),
      ".git/common/specty/activity/claude-code-s1.json": JSON.stringify({
        tool: "claude-code",
        folder: root,
        first: at,
        last: at,
      }),
    });
    expect((await cli(root, ["next"], inConversation("s1"))).out).toBe(before);
    expect((await cli(root, ["next"], inConversation("s2"))).out).toBe(before);
  });
});
