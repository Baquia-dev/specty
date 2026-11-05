// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

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

/** Antigravity's hook for `event`, with the input it documents: camelCase, no event name. */
const antigravity = (root: string, event: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "antigravity", "--event", event], {
    stdin: JSON.stringify({
      conversationId: "c1",
      workspacePaths: [root],
      transcriptPath: "",
      artifactDirectoryPath: "",
      modelName: "gemini",
      ...input,
    }),
  });

/** Its reply: always JSON, always exit 0, since it blocks the tool on anything else. */
const answer = async (reply: Promise<{ code: number; out: string }>) => {
  const { code, out } = await reply;
  expect(code).toBe(0);
  return JSON.parse(out);
};

const step = (index: number, name: string, args: Record<string, unknown>) => ({
  toolCall: { name, args },
  stepIdx: index,
});

describe("the guard in Antigravity", () => {
  it("denies what the flow does not allow, with the reason and the way on, and allows the rest (AC1)", async () => {
    const root = await implementing();
    const write = (index: number, path: string) =>
      step(index, "write_to_file", { TargetFile: join(root, path), CodeContent: "x" });
    expect(await answer(antigravity(root, "PreToolUse", write(1, "src/app.ts")))).toEqual({
      decision: "allow",
    });
    const outside = await answer(antigravity(root, "PreToolUse", write(2, "src/other.ts")));
    expect(outside.decision).toBe("deny");
    expect(outside.reason).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.reason).toMatch(/^SIGUIENTE: /m);
    const replace = step(3, "replace_file_content", { TargetFile: join(root, "src/third.ts") });
    expect((await answer(antigravity(root, "PreToolUse", replace))).decision).toBe("deny");
    const command = (index: number, line: string) =>
      step(index, "run_command", { CommandLine: line, Cwd: root });
    await writeFiles(root, { "src/app.ts": "changed\n" });
    for (const [index, line] of [
      [4, "git commit -am 'Sin recibo'"],
      [5, "specty approve"],
    ] as const) {
      expect((await answer(antigravity(root, "PreToolUse", command(index, line)))).decision).toBe(
        "deny",
      );
    }
    const view = step(6, "view_file", { AbsolutePath: join(root, "src/app.ts") });
    expect(await answer(antigravity(root, "PreToolUse", view))).toEqual({ decision: "allow" });
  });

  it("judges what its agent types into a running task as a command it runs (AC6)", async () => {
    const root = await implementing();
    const task = (index: number, args: Record<string, unknown>) =>
      answer(antigravity(root, "PreToolUse", step(index, "manage_task", args)));
    const typed = await task(1, { Action: "send_input", TaskId: "t1", Input: "specty approve\n" });
    expect(typed.decision).toBe("deny");
    expect(typed.reason).toMatch(/^SIGUIENTE: /m);
    expect((await task(2, { Action: "send_input", TaskId: "t1", Input: "y\n" })).decision).toBe(
      "allow",
    );
    expect(await task(3, { Action: "status", TaskId: "t1" })).toEqual({ decision: "allow" });
  });

  it("gives the warning after a command with the conversation's next model call, once (AC2)", async () => {
    const root = await implementing();
    const command = step(7, "run_command", { CommandLine: "python3 gen.py", Cwd: root });
    expect((await answer(antigravity(root, "PreToolUse", command))).decision).toBe("allow");
    await writeFiles(root, { "src/other.ts": "generated\n" });
    expect(await answer(antigravity(root, "PostToolUse", command))).toEqual({});
    const invocation = (index: number) =>
      antigravity(root, "PreInvocation", { invocationNum: index, initialNumSteps: 8 });
    const next = await answer(invocation(1));
    expect(next.injectSteps).toHaveLength(1);
    expect(next.injectSteps[0].ephemeralMessage).toContain(
      "`src/other.ts` está fuera del alcance de T1.",
    );
    expect(await answer(invocation(2))).toEqual({});
  });

  it("AC1: judges what it writes and creates with its tools in ACP editors like any write", async () => {
    const root = await implementing();
    const client = (index: number, name: string, path: string) =>
      step(index, name, { target_file: join(root, path), code_content: "x\n" });
    expect(
      await answer(antigravity(root, "PreToolUse", client(1, "client_edit_file", "src/app.ts"))),
    ).toEqual({ decision: "allow" });
    const outside = await answer(
      antigravity(root, "PreToolUse", client(2, "client_create_file", "src/other.ts")),
    );
    expect(outside.decision).toBe("deny");
    expect(outside.reason).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.reason).toMatch(/^SIGUIENTE: /m);
    // What the agent in Frecu rewrote: Specty's configuration is managed by Specty.
    const config = await answer(
      antigravity(root, "PreToolUse", client(3, "client_edit_file", ".specty/config.yaml")),
    );
    expect(config.decision).toBe("deny");
    expect(config.reason).toContain("`.specty/config.yaml` lo gestiona Specty");
    const view = step(4, "client_view_file", { absolute_path: join(root, "src/app.ts") });
    expect(await answer(antigravity(root, "PreToolUse", view))).toEqual({ decision: "allow" });
  });

  it("AC1: judges what it writes and edits with the tools of its CLI like any write", async () => {
    const root = await implementing();
    const write = (index: number, path: string) =>
      step(index, "write_file", {
        Path: join(root, path),
        Content: "x\n",
        Overwrite: true,
        Append: false,
      });
    const edit = (index: number, path: string) =>
      step(index, "edit_file", { Path: join(root, path), Target: "hola", Replacement: "adiós" });
    expect(await answer(antigravity(root, "PreToolUse", write(1, "src/app.ts")))).toEqual({
      decision: "allow",
    });
    expect(await answer(antigravity(root, "PreToolUse", edit(2, "src/app.ts")))).toEqual({
      decision: "allow",
    });
    const outside = await answer(antigravity(root, "PreToolUse", write(3, "src/other.ts")));
    expect(outside.decision).toBe("deny");
    expect(outside.reason).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.reason).toMatch(/^SIGUIENTE: /m);
    const edited = await answer(antigravity(root, "PreToolUse", edit(4, "src/third.ts")));
    expect(edited.decision).toBe("deny");
    expect(edited.reason).toContain("`src/third.ts` está fuera del alcance de T1.");
    const config = await answer(antigravity(root, "PreToolUse", edit(5, ".specty/config.yaml")));
    expect(config.decision).toBe("deny");
    expect(config.reason).toContain("`.specty/config.yaml` lo gestiona Specty");
  });

  it("lets everything through, with exit 0, outside Specty and on an event it cannot read (AC3)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    const command = step(1, "run_command", { CommandLine: "rm -rf src", Cwd: root });
    expect(await answer(antigravity(root, "PreToolUse", command))).toEqual({ decision: "allow" });
    expect(await answer(antigravity(root, "PostToolUse", command))).toEqual({});
    expect(await answer(antigravity(root, "PreInvocation", { invocationNum: 0 }))).toEqual({});
    const broken = cli(root, ["guard", "--tool", "antigravity", "--event", "PreToolUse"], {
      stdin: "not json",
    });
    expect(await answer(broken)).toEqual({ decision: "allow" });
  });
});

/**
 * A repository with a change in its own folder, which Antigravity's conversation `c1` entered: its
 * editor gives it the worktrees' folder too, so the change's folder is within its reach.
 */
async function entered(): Promise<{ readonly root: string; readonly folder: string }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const enter = {
    ...step(1, "run_command", { CommandLine: `specty enter ${CHANGE}`, Cwd: root }),
    workspacePaths: [root, `${root}.worktrees`],
  };
  expect((await answer(antigravity(root, "PreToolUse", enter))).decision).toBe("allow");
  return { root, folder: folderOf(root) };
}

describe("Antigravity and a change's folder out of its reach", () => {
  it("AC1: denies `specty enter`, naming its folders and the change's, and says how to carry on", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    // A workspace that does not hold the change's folder, such as one subfolder of the project.
    const enter = {
      ...step(1, "run_command", { CommandLine: `specty enter ${CHANGE}`, Cwd: root }),
      workspacePaths: [join(root, "src")],
    };
    const denied = await answer(antigravity(root, "PreToolUse", enter));
    expect(denied.decision).toBe("deny");
    expect(denied.reason).toContain(
      "Antigravity solo trabaja dentro de las carpetas de su espacio de trabajo",
    );
    expect(denied.reason).toContain(`\`${folderOf(root)}\`, no está en ninguna`);
    expect(denied.reason).toContain("en una conversación nueva que empiece por `specty next`");
    expect(denied.reason).toContain(
      `que añada \`${join(root, ".worktrees")}\` al proyecto de su editor`,
    );
    expect(denied.reason).toMatch(/^SIGUIENTE: no entres\./m);
  });

  it("AC2: leaves the conversation in its own folder after the denial", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const enter = {
      ...step(1, "run_command", { CommandLine: `specty enter ${CHANGE}`, Cwd: root }),
      workspacePaths: [join(root, "src")],
    };
    expect((await answer(antigravity(root, "PreToolUse", enter))).decision).toBe("deny");
    // Bound to the change, this read would be sent to the same path in the change's folder.
    const view = step(2, "view_file", { AbsolutePath: join(root, "src/app.ts") });
    expect(await answer(antigravity(root, "PreToolUse", view))).toEqual({ decision: "allow" });
  });

  it("AC3: enters as before when the change's folder is within its workspace", async () => {
    const { root, folder } = await entered();
    const outside = step(2, "view_file", { AbsolutePath: join(root, "src/app.ts") });
    const denied = await answer(antigravity(root, "PreToolUse", outside));
    expect(denied.decision).toBe("deny");
    expect(denied.reason).toContain(join(folder, "src/app.ts"));
  });
});

describe("Antigravity in the folder of the change its conversation entered", () => {
  it("blocks what it would read outside that folder, with the same path inside (C5 AC2)", async () => {
    const { root, folder } = await entered();
    const reads = [
      ["view_file", { AbsolutePath: join(root, "src/app.ts") }, "src/app.ts"],
      ["list_dir", { DirectoryPath: join(root, "src") }, "src"],
      ["grep_search", { SearchPath: join(root, "src"), Query: "greet" }, "src"],
      ["find_by_name", { SearchDirectory: join(root, "src"), Pattern: "*.ts" }, "src"],
    ] as const;
    for (const [index, [name, args, inside]] of reads.entries()) {
      const denied = await answer(antigravity(root, "PreToolUse", step(index + 2, name, args)));
      expect(denied.decision).toBe("deny");
      expect(denied.reason).toContain(
        `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(folder, inside)}\`.`,
      );
    }
    // A conversation that entered nothing reads anywhere.
    const free = step(9, "view_file", { AbsolutePath: join(folder, "src/app.ts") });
    expect(
      await answer(antigravity(root, "PreToolUse", { ...free, conversationId: "c2" })),
    ).toEqual({ decision: "allow" });
  });

  it("AC2: blocks what it reads outside that folder with its tool in ACP editors, with the same path inside", async () => {
    const { root, folder } = await entered();
    const outside = step(2, "client_view_file", { absolute_path: join(root, "src/app.ts") });
    const denied = await answer(antigravity(root, "PreToolUse", outside));
    expect(denied.decision).toBe("deny");
    expect(denied.reason).toContain(
      `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(folder, "src/app.ts")}\`.`,
    );
    const inside = step(3, "client_view_file", { absolute_path: join(folder, "src/app.ts") });
    expect((await answer(antigravity(root, "PreToolUse", inside))).decision).toBe("allow");
  });

  it("AC2: blocks a file or a folder it reads outside that folder with read_file in its CLI, with the same path inside", async () => {
    const { root, folder } = await entered();
    for (const [index, path] of ["src/app.ts", "src"].entries()) {
      const outside = step(index + 2, "read_file", { Path: join(root, path) });
      const denied = await answer(antigravity(root, "PreToolUse", outside));
      expect(denied.decision).toBe("deny");
      expect(denied.reason).toContain(
        `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(folder, path)}\`.`,
      );
    }
    const inside = step(4, "read_file", { Path: join(folder, "src/app.ts") });
    expect((await answer(antigravity(root, "PreToolUse", inside))).decision).toBe("allow");
    // A conversation that entered nothing reads anywhere.
    const free = step(5, "read_file", { Path: join(root, "src/app.ts") });
    expect(
      await answer(antigravity(root, "PreToolUse", { ...free, conversationId: "c2" })),
    ).toEqual({ decision: "allow" });
  });

  it("AC2: opens only git's common folder with each action it allows, not the worktrees' one", async () => {
    const { root, folder } = await entered();
    const view = step(10, "view_file", { AbsolutePath: join(folder, "src/app.ts") });
    expect(await answer(antigravity(root, "PreToolUse", view))).toEqual({
      decision: "allow",
      permissionOverrides: [`write_file(${join(root, ".git")})`],
    });
    const write = step(11, "write_to_file", { TargetFile: join(folder, "notas.md") });
    expect((await answer(antigravity(root, "PreToolUse", write))).permissionOverrides).toEqual([
      `write_file(${join(root, ".git")})`,
    ]);
  });
});

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const HOOKS = ".agents/hooks.json";
/** The guard's matcher before Antigravity's tools in ACP editors: with the reads, without them. */
const BEFORE_ACP =
  "run_command|write_to_file|replace_file_content|multi_replace_file_content|manage_task|view_file|list_dir|grep_search|find_by_name";
/** The guard's matcher before the tools of its CLI (`agy`): with those of ACP editors. */
const BEFORE_CLI = `${BEFORE_ACP}|client_view_file|client_edit_file|client_create_file`;
// AC3: init writes the tools of its CLI too, after those of its editor and of ACP editors.
const TOOLS = `${BEFORE_CLI}|read_file|write_file|edit_file`;

describe("installing the guard in Antigravity", () => {
  it("writes the specty hook next to the person's, out of git, and doctor and uninstall find it (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    const mine = { "my-linter": { PostToolUse: [{ matcher: "run_command", hooks: [] }] } };
    await writeFiles(root, { [HOOKS]: JSON.stringify(mine) });
    const init = await cli(root, ["init", "--language", "es", "--tools", "antigravity"]);
    expect(init.code).toBe(0);
    expect(init.out).toContain("Antigravity: guard en .agents/hooks.json (local).");
    expect(init.out).toContain(
      "Antigravity solo carga .agents/hooks.json si confías en la carpeta",
    );
    const hooks = JSON.parse(await read(root, HOOKS));
    expect(hooks["my-linter"]).toEqual(mine["my-linter"]);
    const handler = (event: string) => ({
      type: "command",
      command: expect.stringContaining(`guard --tool antigravity --event ${event}`),
      timeout: 30,
    });
    expect(hooks.specty).toEqual({
      PreToolUse: [
        {
          matcher: TOOLS,
          hooks: [handler("PreToolUse")],
        },
      ],
      PostToolUse: [{ matcher: "run_command", hooks: [handler("PostToolUse")] }],
      PreInvocation: [handler("PreInvocation")],
    });
    expect(await read(root, ".git/info/exclude")).toContain(`/${HOOKS}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await cli(root, ["doctor"])).out).toContain(
      "Antigravity: guard en .agents/hooks.json; Antigravity lo ejecuta cuando confías en la carpeta.",
    );

    const { PreInvocation: _, ...rest } = hooks.specty;
    await writeFiles(root, { [HOOKS]: JSON.stringify({ ...hooks, specty: rest }) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Antigravity: faltan hooks de Specty en .agents/hooks.json (PreInvocation); ejecuta `specty init --tools antigravity`.",
    );

    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(JSON.parse(await read(root, HOOKS))).toEqual(mine);
  });

  it("AC4: doctor names a hook from before its tools in ACP editors, and init brings it up to date", async () => {
    const root = await tempRepo(PACKAGE);
    expect((await cli(root, ["init", "--language", "es", "--tools", "antigravity"])).code).toBe(0);
    const line =
      "Antigravity: .agents/hooks.json es de antes de sus herramientas en los editores ACP (Zed, JetBrains), así que el guard no ve lo que lee y escribe allí; ejecuta `specty init --tools antigravity`.";
    expect((await cli(root, ["doctor"])).out).not.toContain(line);
    const hooks = JSON.parse(await read(root, HOOKS));
    const older = [{ ...hooks.specty.PreToolUse[0], matcher: BEFORE_ACP }];
    await writeFiles(root, {
      [HOOKS]: JSON.stringify({ ...hooks, specty: { ...hooks.specty, PreToolUse: older } }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(line);
    // Not the older warning: that hook already sees the reads.
    expect(doctor.out).not.toContain("es de antes de `specty enter`");
    expect((await cli(root, ["init", "--language", "es", "--tools", "antigravity"])).code).toBe(0);
    expect(JSON.parse(await read(root, HOOKS)).specty.PreToolUse[0].matcher).toBe(TOOLS);
    expect((await cli(root, ["doctor"])).out).not.toContain(line);
  });

  it("AC4: doctor names a hook from before the tools of its CLI, and init brings it up to date", async () => {
    const root = await tempRepo(PACKAGE);
    expect((await cli(root, ["init", "--language", "es", "--tools", "antigravity"])).code).toBe(0);
    const line =
      "Antigravity: .agents/hooks.json es de antes de las herramientas de su CLI (`agy`), así que el guard no ve lo que lee, escribe y edita allí; ejecuta `specty init --tools antigravity`.";
    expect((await cli(root, ["doctor"])).out).not.toContain(line);
    const hooks = JSON.parse(await read(root, HOOKS));
    const older = [{ ...hooks.specty.PreToolUse[0], matcher: BEFORE_CLI }];
    await writeFiles(root, {
      [HOOKS]: JSON.stringify({ ...hooks, specty: { ...hooks.specty, PreToolUse: older } }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(line);
    // Not the older warning: that hook already sees its tools in ACP editors.
    expect(doctor.out).not.toContain("es de antes de sus herramientas en los editores ACP");
    expect((await cli(root, ["init", "--language", "es", "--tools", "antigravity"])).code).toBe(0);
    expect(JSON.parse(await read(root, HOOKS)).specty.PreToolUse[0].matcher).toBe(TOOLS);
    expect((await cli(root, ["doctor"])).out).not.toContain(line);
  });

  it("finds Antigravity by its own files, not by the skills Codex also keeps in .agents (AC4)", async () => {
    const skills = await tempRepo({ ...PACKAGE, ".agents/skills/x/SKILL.md": "x\n" });
    expect((await cli(skills, ["init", "--language", "es"])).out).not.toContain("Antigravity");
    const rules = await tempRepo({ ...PACKAGE, ".agents/rules/style.md": "x\n" });
    expect((await cli(rules, ["init", "--language", "es"])).out).toContain(
      "Antigravity: guard en .agents/hooks.json",
    );
  });
});
