// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  git,
  person,
  type Run,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";
const CHECKS = "checks:\n  levels: { secrets: off }\n";

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
/** A repository with a change in its own folder, which Devin's session `s1` entered. */
async function entered(): Promise<{ readonly root: string; readonly folder: string }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const enter = tool("exec", { command: `specty enter ${CHANGE}` });
  expect((await devin(root, "PreToolUse", enter)).code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** What the guard gives Devin to merge into the tool's arguments; undefined when nothing. */
const rewritten = (run: Run): unknown =>
  run.out === "" ? undefined : JSON.parse(run.out).hookSpecificOutput.updatedInput;

describe("Devin in the folder of the change its conversation entered", () => {
  it("moves files, searches, patches and commands to that folder, judged by its rules (C5 AC1)", async () => {
    const { root, folder } = await entered();
    const before = (name: string, input: Record<string, unknown>) =>
      devin(root, "PreToolUse", tool(name, input, "call_2"));
    expect(rewritten(await before("write", { file_path: "notas.md", content: "x" }))).toEqual({
      file_path: join(folder, "notas.md"),
      content: "x",
    });
    expect(rewritten(await before("read", { path: join(root, "src/app.ts") }))).toEqual({
      path: join(folder, "src/app.ts"),
    });
    expect(rewritten(await before("grep", { pattern: "greet", path: "src" }))).toEqual({
      pattern: "greet",
      path: join(folder, "src"),
    });
    const patch = (path: string) => ["*** Begin Patch", `*** Add File: ${path}`, "+x"].join("\n");
    expect(rewritten(await before("apply_patch", { input: patch("notas.md") }))).toEqual({
      input: patch(join(folder, "notas.md")),
    });
    expect(rewritten(await before("exec", { command: "pnpm test", shell_id: "main" }))).toEqual({
      command: `cd '${folder}' && pnpm test`,
      shell_id: "main",
    });
    const code = await before("edit", {
      file_path: "src/app.ts",
      old_string: "a",
      new_string: "b",
    });
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
    // A conversation that entered nothing works where it was.
    const other = await tempRepo(APP);
    const free = await devin(other, "PreToolUse", tool("exec", { command: "pnpm test" }));
    expect(free).toMatchObject({ code: 0, out: "" });
  });
});

const HOOKS = ".devin/hooks.v1.json";
const CONFIG_FILE = ".devin/config.json";
const LOCAL_FILE = ".devin/config.local.json";

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
      ours(
        "^(exec|write|edit|notebook_edit|apply_patch|write_to_process|read|notebook_read|grep|glob)$",
      ),
    ]);
    expect(hooks.PostToolUse).toEqual([lint, ours("^exec$")]);
    expect(hooks.PostCompaction).toEqual([{ hooks: ours("").hooks }]);
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

describe("Devin's permissions", () => {
  it("let Specty's commands run without asking, and its sandbox write in Specty's folders (AC5)", async () => {
    const mine = { permissions: { allow: ["Exec(npm test)"] } };
    const root = await tempRepo({ ...PACKAGE, [CONFIG_FILE]: JSON.stringify(mine) });
    const init = await cli(root, ["init", "--language", "es", "--tools", "windsurf"]);
    expect(init.out).toContain(
      "Devin (Windsurf): regla en .devin/config.json para que los comandos de Specty se ejecuten sin preguntar; Specty decide quién ejecuta cada uno.",
    );
    expect(init.out).toContain(
      "Devin (Windsurf): .devin/config.local.json (local) deja escribir a los comandos de Specty en la carpeta de git y en la de las worktrees cuando activas su sandbox.",
    );
    const allowed = async (file: string) => JSON.parse(await read(root, file)).permissions.allow;
    const shared = ["Exec(npm test)", "Exec(specty)"];
    expect(await allowed(CONFIG_FILE)).toEqual(shared);
    expect(await allowed(LOCAL_FILE)).toEqual([
      `Write(${join(root, ".git")}/**)`,
      `Write(${root}.worktrees/**)`,
      `Read(${root}.worktrees/**)`,
    ]);
    expect(await read(root, ".git/info/exclude")).toContain(`/${LOCAL_FILE}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    await cli(root, ["init", "--language", "es", "--tools", "windsurf"]);
    expect(await allowed(CONFIG_FILE)).toEqual(shared);

    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(JSON.parse(await read(root, CONFIG_FILE))).toEqual(mine);
    expect(existsSync(join(root, LOCAL_FILE))).toBe(false);
  });
});

describe("the task card in Devin", () => {
  it("comes back with the next command's result after a compaction, once (AC3)", async () => {
    const root = await implementing();
    const compacted = await devin(root, "PostCompaction", { summary: "Resumen." });
    expect(compacted).toMatchObject({ code: 0, out: "" });
    const run = async (id: string, command: string) => {
      const call = tool("exec", { command, shell_id: "main" }, id);
      await devin(root, "PreToolUse", call);
      return devin(root, "PostToolUse", { ...call, tool_response: { success: true, output: "" } });
    };
    const after = await run("call_2", "ls");
    expect(JSON.parse(after.out).hookSpecificOutput.additionalContext).toContain("TAREA T1");
    expect(await run("call_3", "ls -a")).toMatchObject({ code: 0, out: "" });
  });
});

describe("the end of Devin's turn", () => {
  it("sends it back with the report while specty check --changed fails, once (AC4)", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    const stop = (active: boolean) =>
      cli(root, ["hook", "agent-stop", "windsurf"], {
        stdin: JSON.stringify({
          session_id: "s1",
          prompt_id: "p1",
          hook_event_name: "Stop",
          stop_hook_active: active,
        }),
      });
    const back = await stop(false);
    expect(back.code).toBe(0);
    const reply = JSON.parse(back.out);
    expect(reply.decision).toBe("block");
    expect(reply.reason).toContain(`FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`);
    // Already sent back once: it may end now, so that it never loops.
    expect(await stop(true)).toMatchObject({ code: 0, out: "" });
  });

  it("is offered by check --install next to the guard, once, and init keeps it (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    await cli(root, ["init", "--language", "es", "--tools", "windsurf"]);
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out).toContain(`${HOOKS} (modificar)`);
    expect(plan.out).toContain("hook agent-stop windsurf");
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    const hooks = async () => JSON.parse(await read(root, HOOKS));
    const turn = (await hooks()).Stop;
    expect(turn).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: expect.stringContaining("hook agent-stop windsurf"),
            timeout: 600,
          },
        ],
      },
    ]);
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain("agent-stop");
    await cli(root, ["init", "--language", "es", "--tools", "windsurf"]);
    expect((await hooks()).Stop).toEqual(turn);
  });
});
