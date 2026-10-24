// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** A repository whose change is implementing T1 (`src/app.ts`, `src/app.test.ts`). */
async function implementing(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person() });
  await cli(root, ["next"]);
  return root;
}

/** Cursor's hook around its `Shell` tool, with the fields its documentation lists. */
const shell = (root: string, event: string, id: string, command = "python3 gen.py") =>
  cli(root, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify({
      hook_event_name: event,
      conversation_id: "c",
      workspace_roots: [root],
      cwd: root,
      tool_name: "Shell",
      tool_input: { command },
      tool_use_id: id,
    }),
  });

const answer = async (reply: Promise<{ code: number; out: string }>) => {
  const { code, out } = await reply;
  expect(code).toBe(0);
  return JSON.parse(out);
};

describe("the check after each command in Cursor", () => {
  it("adds to the conversation what a command changed outside the task (AC1)", async () => {
    const root = await implementing();
    expect(await answer(shell(root, "preToolUse", "c1"))).toEqual({ permission: "allow" });
    await writeFiles(root, { "src/app.ts": "in scope\n", "src/other.ts": "generated\n" });
    const after = await answer(shell(root, "postToolUse", "c1"));
    expect(Object.keys(after)).toEqual(["additional_context"]);
    expect(after.additional_context).toMatch(
      /^specty: El comando cambió lo que el flujo no permite/,
    );
    expect(after.additional_context).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(after.additional_context).toContain(
      'pide ampliar el alcance con `specty scope add src/other.ts --task T1 --reason "<motivo>"`.',
    );
  });

  it("says nothing when the command stayed in the task, and checks failed ones too (AC1)", async () => {
    const root = await implementing();
    await shell(root, "preToolUse", "c2");
    await writeFiles(root, { "src/app.ts": "in scope\n" });
    expect(await answer(shell(root, "postToolUse", "c2"))).toEqual({});
    await shell(root, "preToolUse", "c3");
    await writeFiles(root, { "src/third.ts": "x\n" });
    const failed = await answer(shell(root, "postToolUseFailure", "c3"));
    expect(failed.additional_context).toContain("`src/third.ts` está fuera del alcance de T1.");
    // Without a snapshot from before the command, there is nothing to compare.
    expect(await answer(shell(root, "postToolUse", "unknown"))).toEqual({});
  });
});

describe("installing the check in Cursor", () => {
  it("writes `postToolUse` and `postToolUseFailure`, and doctor misses them (AC5)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    expect((await cli(root, ["init", "--language", "es", "--tools", "cursor"])).code).toBe(0);
    const config = JSON.parse(await read(root, ".cursor/hooks.json"));
    for (const event of ["postToolUse", "postToolUseFailure"]) {
      expect(config.hooks[event]).toEqual([
        { command: expect.stringContaining("guard --tool cursor"), matcher: "Shell" },
      ]);
    }
    expect((await cli(root, ["doctor"])).out).toContain("Cursor: guard instalado.");
    const hooks = { ...config.hooks, postToolUseFailure: [] };
    await writeFiles(root, { ".cursor/hooks.json": JSON.stringify({ ...config, hooks }) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Cursor: falta la comprobación tras cada comando (postToolUseFailure); ejecuta `specty init --tools cursor`.",
    );
  });
});
