// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  inWorktree,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");

/** The conversation the person talks to, and two of its subagents, with ids as Cursor gives them. */
const MAIN = randomUUID();
const SUBAGENT = randomUUID();
const SECOND_SUBAGENT = randomUUID();

/**
 * The fields of every hook of Cursor, as a subagent sends them since 2.4 (its forum, 2026-06-12): a
 * `conversation_id` of its own, the same `session_id`, no transcript, and nothing that links it to
 * the conversation that launched it.
 */
const common = (root: string, conversation: string, event: string) => ({
  conversation_id: conversation,
  generation_id: randomUUID(),
  model: "default",
  hook_event_name: event,
  cursor_version: "3.7.27",
  workspace_roots: [root],
  user_email: "ana@example.com",
  transcript_path:
    conversation === MAIN
      ? `/Users/ana/.cursor/projects/app/agent-transcripts/${MAIN}.jsonl`
      : null,
  session_id: conversation,
});

/** What the guard answers one of Cursor's hooks, as Cursor reads it. */
async function hook(root: string, event: Readonly<Record<string, unknown>>) {
  const { code, out } = await cli(root, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify(event),
  });
  expect(code).toBe(0);
  return JSON.parse(out);
}

/** Cursor's `preToolUse` before a tool of the conversation `who`, which works where Cursor does. */
const before = (
  root: string,
  who: string,
  tool: string,
  input: Readonly<Record<string, unknown>>,
  id = "t1",
) =>
  hook(root, {
    ...common(root, who, "preToolUse"),
    tool_name: tool,
    tool_input: input,
    tool_use_id: id,
    cwd: root,
    agent_message: "",
  });

const shell = (root: string, who: string, command: string, id?: string) =>
  before(root, who, "Shell", { command }, id);

/** Cursor's `beforeShellExecution`, with the command as it is about to run. */
const beforeShell = (root: string, who: string, command: string) =>
  hook(root, { ...common(root, who, "beforeShellExecution"), command, cwd: root, sandbox: false });

/** Cursor's `postToolUse` after the command `id` of `who`. */
const after = (root: string, who: string, id: string, command: string) =>
  hook(root, {
    ...common(root, who, "postToolUse"),
    tool_name: "Shell",
    tool_input: { command },
    tool_output: "",
    tool_use_id: id,
    cwd: root,
    duration: 120,
  });

/** What the guard answers a command it lets through once it goes to `folder`. */
const goes = (folder: string, command: string) => ({
  permission: "allow",
  updated_input: { command: `cd '${folder}' && ${command}` },
});

/** A repository with two open changes, each in its own folder. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

describe("a subagent of Cursor", () => {
  it("AC1: is bound to a change's folder by its own conversation_id, and the conversation that launched it stays in its own", async () => {
    const { root, first, second } = await twoChanges();
    expect((await shell(root, MAIN, `specty enter ${CHANGE}`)).permission).toBe("allow");
    // It starts where Cursor works, with nothing that links it to the conversation.
    expect((await shell(root, SUBAGENT, `specty enter ${OTHER}`)).permission).toBe("allow");
    expect(await shell(root, SUBAGENT, "pnpm test")).toEqual(goes(second, "pnpm test"));
    expect(await shell(root, MAIN, "pnpm test")).toEqual(goes(first, "pnpm test"));
    // Another subagent, which entered nothing, runs its command where Cursor runs it.
    expect(await shell(root, SECOND_SUBAGENT, "pnpm test")).toEqual({ permission: "allow" });
  });

  it("AC2: runs each of its commands in its folder, and judges it as it comes before it runs", async () => {
    const { root, first, second } = await twoChanges();
    await shell(root, MAIN, `specty enter ${CHANGE}`);
    await shell(root, SUBAGENT, `specty enter ${OTHER}`);
    const inner = { command: "ls", working_directory: join(root, "src") };
    expect(await before(root, SUBAGENT, "Shell", inner)).toEqual({
      permission: "allow",
      updated_input: { ...inner, command: `cd '${join(second, "src")}' && ls` },
    });
    const elsewhere = await beforeShell(root, SUBAGENT, "pnpm test");
    expect(elsewhere.permission).toBe("deny");
    expect(elsewhere.agent_message).toContain(
      `SIGUIENTE: ejecútalo allí: \`cd '${second}' && pnpm test\`.`,
    );
    const there = `cd '${second}' && pnpm test`;
    expect(await beforeShell(root, SUBAGENT, there)).toEqual({ permission: "allow" });
    // The folder of the conversation that launched it is not its own, nor the other way round.
    const launcher = `cd '${first}' && pnpm test`;
    expect((await beforeShell(root, SUBAGENT, launcher)).permission).toBe("deny");
    expect(await beforeShell(root, MAIN, launcher)).toEqual({ permission: "allow" });
    expect((await beforeShell(root, MAIN, there)).permission).toBe("deny");
  });

  it("AC3: is blocked from writing, deleting or reading outside its folder, with the same path inside, and judged there by its change's rules", async () => {
    const { root, second } = await twoChanges();
    await shell(root, SUBAGENT, `specty enter ${OTHER}`);
    for (const [tool, input, path] of [
      ["Write", { file_path: join(root, "src/nuevo.ts") }, "src/nuevo.ts"],
      ["Delete", { path: join(root, "src/app.ts") }, "src/app.ts"],
      ["Read", { target_file: join(root, "src/app.ts") }, "src/app.ts"],
      ["Grep", { path: join(root, "src") }, "src"],
    ] as const) {
      const denied = await before(root, SUBAGENT, tool, input);
      expect(denied.permission, tool).toBe("deny");
      expect(denied.agent_message).toContain(
        `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(second, path)}\`.`,
      );
    }
    // Inside it, its change's rules judge: the spec is open while drafted, the code is not yet.
    const spec = { file_path: join(second, `.specty/changes/${OTHER}/spec.md`) };
    expect(await before(root, SUBAGENT, "Write", spec)).toEqual({ permission: "allow" });
    const code = await before(root, SUBAGENT, "Write", { file_path: join(second, "src/nuevo.ts") });
    expect(code.permission).toBe("deny");
    expect(code.agent_message).toContain(`El cambio ${OTHER} está en fase`);
  });

  it("AC4: is told after each of its commands what changed in its folder outside its task", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    await cli(folder, ["next"]);
    await shell(root, SUBAGENT, `specty enter ${CHANGE}`);
    const command = "python3 gen.py";
    expect(await shell(root, SUBAGENT, command, "c1")).toEqual(goes(folder, command));
    await writeFiles(folder, { "src/other.ts": "generated\n" });
    const said = await after(root, SUBAGENT, "c1", `cd '${folder}' && ${command}`);
    expect(said.additional_context).toContain("`src/other.ts` está fuera del alcance de T1.");
  });

  it("AC5: works one open change at a time, another subagent may enter that one, and it is free once its change ends", async () => {
    const { root, first, second } = await twoChanges();
    expect((await shell(root, SUBAGENT, `specty enter ${CHANGE}`)).permission).toBe("allow");
    const denied = await shell(root, SUBAGENT, `specty enter ${OTHER}`);
    expect(denied.permission).toBe("deny");
    expect(denied.agent_message).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
    );
    expect((await shell(root, SECOND_SUBAGENT, `specty enter ${OTHER}`)).permission).toBe("allow");
    await cli(first, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect((await shell(root, SUBAGENT, `specty enter ${OTHER}`)).permission).toBe("allow");
    expect(await shell(root, SUBAGENT, "pnpm test")).toEqual(goes(second, "pnpm test"));
  });
});
