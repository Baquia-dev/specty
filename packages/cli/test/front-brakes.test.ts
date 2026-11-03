// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, NOW, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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
 * A repository whose memory has P1 and P2 in front B, which covers `src/**`, P3 in front ui, which
 * covers `ui/**`, and P4 in no front; conversation s1 of Claude Code holds B.
 */
async function withFronts(): Promise<string> {
  const root = await tempRepo(APP);
  const run = (...args: string[]) => cli(root, args, CLAUDE);
  for (const text of ["Uno", "Dos", "Tres", "Cuatro"]) {
    expect((await run("memory", "add", text)).code).toBe(0);
  }
  expect((await run("front", "add", "B", "Saludo.", "--path", "src/**")).code).toBe(0);
  expect((await run("front", "add", "ui", "Pantallas.", "--path", "ui/**")).code).toBe(0);
  expect((await run("front", "assign", "B", "P1", "P2")).code).toBe(0);
  expect((await run("front", "assign", "ui", "P3")).code).toBe(0);
  expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
  return root;
}

describe("the brake of `specty new --resolves` on another session's front", () => {
  it("AC1: the guard refuses another conversation the change of an entry of a front s1 holds", async () => {
    const root = await withFronts();
    const refused = await bash(root, "s2", 'specty new "Saludo" --resolves p2');
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(
      "P2 es del frente B, que ya tiene dueño: lo lleva claude-code, ahora mismo, en otra conversación.",
    );
    expect(refused.err).toContain("`specty front free B`");
  });

  it("AC2: lets through an entry of no front, of a front without a live owner, or of its own", async () => {
    const root = await withFronts();
    expect((await bash(root, "s2", 'specty new "X" --resolves P4')).code).toBe(0);
    expect((await bash(root, "s2", 'specty new "X" --resolves P3')).code).toBe(0);
    expect((await bash(root, "s1", 'specty new "X" --resolves P1')).code).toBe(0);
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
    expect((await bash(root, "s2", 'specty new "X" --resolves P1')).code).toBe(0);
  });
});

describe("the warning of `specty propose` on another session's front", () => {
  /** The draft of SPEC's change, which lists `src/app.ts` and `src/app.test.ts`, in `root`. */
  async function drafted(root: string): Promise<void> {
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
  }

  it("AC3: names the front another session holds and the spec's files that fall in it", async () => {
    const root = await withFronts();
    await drafted(root);
    const proposed = await cli(root, ["propose"], inConversation("s2"));
    expect(proposed.code).toBe(0);
    expect(proposed.out).toContain(
      "FRENTES DE OTRAS SESIONES:\n  B · lo lleva claude-code, ahora mismo: src/app.ts",
    );
    expect(proposed.out).toContain("no frena nada");
  });

  it("AC4: says nothing to the conversation that holds the front, or for files in no front", async () => {
    const root = await withFronts();
    await drafted(root);
    const own = await cli(root, ["propose"], inConversation("s1"));
    expect(own.code).toBe(0);
    expect(own.out).not.toContain("FRENTES DE OTRAS SESIONES");
    const free = await tempRepo(APP);
    expect(
      (await cli(free, ["front", "add", "ui", "Pantallas.", "--path", "ui/**"], CLAUDE)).code,
    ).toBe(0);
    expect((await bash(free, "s1", "specty front take ui")).code).toBe(0);
    await drafted(free);
    expect((await cli(free, ["propose"], inConversation("s2"))).out).not.toContain(
      "FRENTES DE OTRAS SESIONES",
    );
  });
});
