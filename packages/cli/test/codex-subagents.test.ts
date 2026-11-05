// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, type Run, read, tempRepo } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");

/** The ids Codex 0.166.0 gave a root thread and the subagent it spawned with `spawn_agent`. */
const ROOT = "01a1a689-8c8d-7fd1-9adf-54b342595f1a";
const AGENT = "01a1a689-8ed8-7cc2-ad2d-dcef8a7a1584";
/** The turn each thread was in: a subagent works in a turn of its own. */
const TURN = {
  main: "01a1a689-8d4f-7920-be35-9711e1687947",
  subagent: "01a1a689-8ef6-7c50-9827-a8f6c464d5cc",
};
/** The subagent's own conversation for the guard: the root thread's id and its own. */
const OWN = `${ROOT}--${AGENT}`;

/** Who sends an event: Codex's main thread, or the subagent it spawned. */
interface Who {
  readonly agent?: string;
}

const SUBAGENT: Who = { agent: AGENT };

/**
 * Codex's hook before a tool call of `who`, with the tool working in `cwd`, as Codex 0.166.0 sends
 * it: a subagent's events carry the root thread's `session_id`, and their own turn, `agent_id` and
 * `agent_type`; the main thread's carry neither of the last two.
 */
const codex = (cwd: string, tool: Record<string, unknown>, { agent }: Who = {}) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({
      session_id: ROOT,
      turn_id: agent === undefined ? TURN.main : TURN.subagent,
      transcript_path: null,
      cwd,
      hook_event_name: "PreToolUse",
      model: "gpt-5.5",
      permission_mode: "bypassPermissions",
      ...(agent === undefined ? {} : { agent_id: agent, agent_type: "default" }),
      tool_use_id: "call_4",
      ...tool,
    }),
  });

const bash = (cwd: string, command: string, who?: Who) =>
  codex(cwd, { tool_name: "Bash", tool_input: { command } }, who);

const patch = (...lines: string[]) => ["*** Begin Patch", ...lines, "*** End Patch"].join("\n");

/** Codex's `apply_patch`: the patch travels in `tool_input.command`. */
const applyPatch = (cwd: string, text: string, who?: Who) =>
  codex(cwd, { tool_name: "apply_patch", tool_input: { command: text } }, who);

/** What Codex runs instead (`updatedInput`), with the decision it needs; undefined when nothing. */
function rewritten(run: Run): unknown {
  if (run.out === "") return undefined;
  const output = JSON.parse(run.out).hookSpecificOutput;
  expect(output).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "allow" });
  return output.updatedInput;
}

/** Where the guard keeps the folder a conversation works in. */
const BINDING = (conversation: string) => `.git/common/specty/sessions/${conversation}.json`;

const boundFolder = async (root: string, conversation: string): Promise<string> =>
  JSON.parse(await read(root, BINDING(conversation))).folder;

/** Where the guard notes the last step of a conversation of Codex. */
const ACTIVITY = (conversation: string) => `.git/common/specty/activity/codex-${conversation}.json`;

/** A repository with two open changes, each in its own folder. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

/** Two changes in their folders: the main thread entered the first, its subagent the second. */
async function bothEntered() {
  const changes = await twoChanges();
  expect((await bash(changes.root, `specty enter ${CHANGE}`)).code).toBe(0);
  expect((await bash(changes.root, `specty enter ${OTHER}`, SUBAGENT)).code).toBe(0);
  return changes;
}

describe("a subagent of Codex", () => {
  it("AC1: is a conversation of its own, with a binding and steps apart from the main thread's", async () => {
    const { root, first } = await twoChanges();
    expect((await bash(root, `specty enter ${CHANGE}`, SUBAGENT)).code).toBe(0);
    expect(await boundFolder(root, OWN)).toBe(first);
    await expect(read(root, BINDING(ROOT))).rejects.toThrow();
    // Once inside, its steps count in the folder it entered, under its own conversation.
    expect((await bash(root, "ls", SUBAGENT)).code).toBe(0);
    expect(JSON.parse(await read(root, ACTIVITY(OWN))).folder).toBe(first);
    await expect(read(root, ACTIVITY(ROOT))).rejects.toThrow();
  });

  it("AC2: enters a change's folder with `specty enter`, and the main thread stays in its own", async () => {
    const { root, first, second } = await twoChanges();
    expect((await bash(root, `specty enter ${CHANGE}`)).code).toBe(0);
    expect(await boundFolder(root, ROOT)).toBe(first);
    // The subagent starts where the main thread's turn runs, outside the folder it entered.
    expect((await bash(root, `specty enter ${OTHER}`, SUBAGENT)).code).toBe(0);
    expect(await boundFolder(root, OWN)).toBe(second);
    expect(await boundFolder(root, ROOT)).toBe(first);
  });

  it("AC3: has its commands and patches taken to its folder, and the main thread's to its own", async () => {
    const { root, first, second } = await bothEntered();
    expect(rewritten(await bash(root, "pnpm test", SUBAGENT))).toEqual({
      command: `cd '${second}' && pnpm test`,
    });
    const added = await applyPatch(root, patch("*** Add File: notas.md", "+x"), SUBAGENT);
    expect(rewritten(added)).toEqual({
      command: patch(`*** Add File: ${join(second, "notas.md")}`, "+x"),
    });
    expect(rewritten(await bash(root, "pnpm test"))).toEqual({
      command: `cd '${first}' && pnpm test`,
    });
  });

  it("AC3: is judged by the rules of the change it entered, not by the main thread's", async () => {
    const { root } = await bothEntered();
    const code = await bash(root, "echo x > src/app.ts", SUBAGENT);
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${OTHER} está en fase`);
  });
});
