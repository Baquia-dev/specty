// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, NOW, tempRepo, writeFiles } from "./support";

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

/** Claude Code's `SessionStart` when the conversation `session` starts in `cwd`. */
const started = (cwd: string, session: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      session_id: session,
      cwd,
      hook_event_name: "SessionStart",
      source: "startup",
    }),
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
    // The guard knows the conversation by its event, as when the session starts.
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
    expect((await started(root, "s2")).out).toBe(other.out);
    expect((await cli(root, ["next"])).out).toBe(other.out);
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
