// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, git, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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

/** Devin's hook for `event`, with the input Devin CLI documents: Claude Code's shape. */
const devin = (root: string, event: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "windsurf"], {
    stdin: JSON.stringify({
      session_id: "s1",
      prompt_id: "p1",
      cwd: root,
      hook_event_name: event,
      ...input,
    }),
  });

const tool = (name: string, input: Record<string, unknown>, id = "call_1") => ({
  tool_name: name,
  tool_input: input,
  tool_use_id: id,
});

describe("the guard in Devin", () => {
  it("blocks with exit 2 what the flow does not allow, also typed into a running process (AC1)", async () => {
    const root = await implementing();
    const write = tool("write", { file_path: join(root, "src/app.ts"), content: "x" });
    expect((await devin(root, "PreToolUse", write)).code).toBe(0);
    const edit = tool("edit", { path: "src/other.ts", old_string: "a", new_string: "b" });
    const outside = await devin(root, "PreToolUse", edit);
    expect(outside.code).toBe(2);
    expect(outside.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.err).toMatch(/^SIGUIENTE: /m);
    const patch = ["*** Begin Patch", "*** Add File: src/third.ts", "+x", "*** End Patch"];
    const patched = tool("apply_patch", { input: patch.join("\n") });
    expect((await devin(root, "PreToolUse", patched)).code).toBe(2);
    await writeFiles(root, { "src/app.ts": "changed\n" });
    for (const command of ["git commit -am 'Sin recibo'", "specty approve"]) {
      const run = tool("exec", { command, shell_id: "main" });
      expect((await devin(root, "PreToolUse", run)).code).toBe(2);
    }
    const typed = tool("write_to_process", { input: "specty approve\n" });
    expect((await devin(root, "PreToolUse", typed)).code).toBe(2);
    const reading = tool("read", { file_path: "src/app.ts" });
    expect((await devin(root, "PreToolUse", reading)).code).toBe(0);
  });

  it("adds the warning after a command to its result (AC2)", async () => {
    const root = await implementing();
    const command = tool("exec", { command: "python3 gen.py", shell_id: "main" });
    expect((await devin(root, "PreToolUse", command)).code).toBe(0);
    await writeFiles(root, { "src/other.ts": "generated\n" });
    const after = await devin(root, "PostToolUse", {
      ...command,
      tool_response: { success: true, output: "" },
    });
    expect(after.code).toBe(0);
    expect(JSON.parse(after.out).hookSpecificOutput).toEqual({
      hookEventName: "PostToolUse",
      additionalContext: expect.stringContaining("`src/other.ts` está fuera del alcance de T1."),
    });
  });

  it("lets everything through outside Specty (AC1)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    const command = tool("exec", { command: "rm -rf src", shell_id: "main" });
    expect(await devin(root, "PreToolUse", command)).toMatchObject({ code: 0, err: "" });
    expect(await devin(root, "PostToolUse", command)).toMatchObject({ code: 0, out: "" });
  });
});

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const HOOKS = ".devin/hooks.v1.json";

describe("installing the guard in Devin", () => {
  it("writes it next to the person's hooks, out of git, and doctor and uninstall find it (AC5)", async () => {
    const root = await tempRepo(PACKAGE);
    const lint = { matcher: "^edit$", hooks: [{ type: "command", command: "./lint.sh" }] };
    await writeFiles(root, { [HOOKS]: JSON.stringify({ PostToolUse: [lint] }) });
    const init = await cli(root, ["init", "--language", "es", "--tools", "windsurf"]);
    expect(init.code).toBe(0);
    expect(init.out).toContain("Devin (Windsurf): guard en .devin/hooks.v1.json (local).");
    expect(init.out).toContain("Devin Desktop no carga los hooks en modo restringido");
    const hooks = JSON.parse(await read(root, HOOKS));
    const ours = (matcher: string) => ({
      matcher,
      hooks: [{ type: "command", command: expect.stringContaining("guard --tool windsurf") }],
    });
    expect(hooks.PreToolUse).toEqual([
      ours("^(exec|write|edit|notebook_edit|apply_patch|write_to_process)$"),
    ]);
    expect(hooks.PostToolUse).toEqual([lint, ours("^exec$")]);
    expect(await read(root, ".git/info/exclude")).toContain(`/${HOOKS}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await cli(root, ["doctor"])).out).toContain(
      "Devin (Windsurf): guard en .devin/hooks.v1.json; Devin Desktop no lo ejecuta en modo restringido.",
    );

    await writeFiles(root, { [HOOKS]: JSON.stringify({ ...hooks, PostToolUse: [lint] }) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Devin (Windsurf): faltan hooks de Specty en .devin/hooks.v1.json (PostToolUse); ejecuta `specty init --tools windsurf`.",
    );

    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(JSON.parse(await read(root, HOOKS))).toEqual({ PostToolUse: [lint] });
  });
});
