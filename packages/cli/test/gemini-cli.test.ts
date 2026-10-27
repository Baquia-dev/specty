// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
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

/** Gemini CLI's hook for `event`, with the input it documents: no id for the tool call. */
const gemini = (root: string, event: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "gemini-cli"], {
    stdin: JSON.stringify({
      session_id: "s1",
      transcript_path: "",
      cwd: root,
      hook_event_name: event,
      timestamp: "2026-10-26T10:00:00Z",
      ...input,
    }),
  });

const tool = (name: string, input: Record<string, unknown>) => ({
  tool_name: name,
  tool_input: input,
});

describe("the guard in Gemini CLI", () => {
  it("blocks with exit 2 what the flow does not allow, with the reason and the way on (AC1)", async () => {
    const root = await implementing();
    const write = (path: string) =>
      tool("write_file", { file_path: join(root, path), content: "x" });
    expect((await gemini(root, "BeforeTool", write("src/app.ts"))).code).toBe(0);
    const outside = await gemini(root, "BeforeTool", write("src/other.ts"));
    expect(outside.code).toBe(2);
    expect(outside.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.err).toMatch(/^SIGUIENTE: /m);
    const replace = tool("replace", {
      file_path: "src/third.ts",
      old_string: "a",
      new_string: "b",
    });
    expect((await gemini(root, "BeforeTool", replace)).code).toBe(2);
    await writeFiles(root, { "src/app.ts": "changed\n" });
    for (const command of ["git commit -am 'Sin recibo'", "specty approve"]) {
      const run = await gemini(root, "BeforeTool", tool("run_shell_command", { command }));
      expect(run.code).toBe(2);
    }
    const reading = tool("read_file", { file_path: "src/app.ts" });
    expect((await gemini(root, "BeforeTool", reading)).code).toBe(0);
  });

  it("adds the warning after a command to its result, and runs it in the folder it names (AC2)", async () => {
    const root = await implementing();
    const command = tool("run_shell_command", { command: "python3 gen.py", dir_path: "src" });
    expect((await gemini(root, "BeforeTool", command)).code).toBe(0);
    await writeFiles(root, { "src/other.ts": "generated\n" });
    const after = await gemini(root, "AfterTool", {
      ...command,
      tool_response: { llmContent: "ok", returnDisplay: "ok" },
    });
    expect(after.code).toBe(0);
    expect(JSON.parse(after.out).hookSpecificOutput.additionalContext).toContain(
      "`src/other.ts` está fuera del alcance de T1.",
    );
    const placed = tool("run_shell_command", { command: "echo x > third.ts", dir_path: "src" });
    const denied = await gemini(root, "BeforeTool", placed);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain("`src/third.ts` está fuera del alcance de T1.");
  });

  it("lets everything through outside Specty and on an event it cannot read (AC3)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    const command = tool("run_shell_command", { command: "rm -rf src" });
    expect(await gemini(root, "BeforeTool", command)).toMatchObject({ code: 0, err: "" });
    expect(await gemini(root, "AfterTool", command)).toMatchObject({ code: 0, out: "" });
    const broken = await cli(root, ["guard", "--tool", "gemini-cli"], { stdin: "not json" });
    expect(broken.code).not.toBe(2);
  });
});

/** A repository with a change in its own folder, which the conversation `s1` entered. */
async function entered(): Promise<{ readonly root: string; readonly folder: string }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const enter = tool("run_shell_command", { command: `specty enter ${CHANGE}` });
  expect((await gemini(root, "BeforeTool", enter)).code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** What the guard gives Gemini CLI to merge into the tool's input; undefined when nothing. */
const inputOf = (run: Run): unknown =>
  run.out === "" ? undefined : JSON.parse(run.out).hookSpecificOutput.tool_input;

const before = (root: string, name: string, input: Record<string, unknown>) =>
  gemini(root, "BeforeTool", tool(name, input));

describe("Gemini CLI in the folder of the change its conversation entered", () => {
  it("moves each path to the change's folder, judged by that change's rules (AC1)", async () => {
    const { root, folder } = await entered();
    for (const path of [SPEC_PATH, join(root, SPEC_PATH)]) {
      const written = await before(root, "write_file", { file_path: path, content: "x" });
      expect(written.code).toBe(0);
      // Gemini CLI builds the tool from the hook's input alone: it goes back whole.
      expect(inputOf(written)).toEqual({ file_path: join(folder, SPEC_PATH), content: "x" });
    }
    const read = await before(root, "read_file", { file_path: "src/app.ts", start_line: 2 });
    expect(inputOf(read)).toEqual({ file_path: join(folder, "src/app.ts"), start_line: 2 });
    const listed = await before(root, "list_directory", { dir_path: "." });
    expect(inputOf(listed)).toEqual({ dir_path: folder });
    // Already in the change's folder, or outside the repository: nothing moves.
    const there = await before(root, "read_file", { file_path: join(folder, "src/app.ts") });
    expect(there).toMatchObject({ code: 0, out: "" });
    expect((await before(root, "read_file", { file_path: "/etc/hosts" })).out).toBe("");
    const code = await before(root, "replace", {
      file_path: "src/app.ts",
      old_string: "hola",
      new_string: "adiós",
    });
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("runs searches and commands in the change's folder, or the same folder inside it (AC2)", async () => {
    const { root, folder } = await entered();
    expect(inputOf(await before(root, "grep_search", { pattern: "greet" }))).toEqual({
      pattern: "greet",
      dir_path: folder,
    });
    const nested = await before(root, "glob", { pattern: "*.ts", dir_path: "src" });
    expect(inputOf(nested)).toEqual({ pattern: "*.ts", dir_path: join(folder, "src") });
    // Gemini CLI refuses a `dir_path` outside its project's folder: the command goes after a `cd`.
    const moved = { command: `cd '${relative(root, folder)}' && python3 gen.py` };
    const command = await before(root, "run_shell_command", { command: "python3 gen.py" });
    expect(inputOf(command)).toEqual(moved);
    const inner = { command: "ls", dir_path: "src" };
    expect(inputOf(await before(root, "run_shell_command", inner))).toEqual({
      command: `cd '${relative(root, join(folder, "src"))}' && ls`,
    });
    // After it, with the input Gemini CLI ran, the guard compares the change's folder.
    await writeFiles(folder, { "src/other.ts": "generated\n" });
    const after = await gemini(root, "AfterTool", {
      ...tool("run_shell_command", moved),
      tool_response: { llmContent: "" },
    });
    expect(JSON.parse(after.out).hookSpecificOutput.additionalContext).toContain(
      `El cambio ${CHANGE} está en fase draft`,
    );
  });

  it("keeps a search without a folder in the tool's own when the conversation entered none (AC3)", async () => {
    const root = await tempRepo(APP);
    expect(inputOf(await before(root, "grep_search", { pattern: "greet" }))).toEqual({
      pattern: "greet",
      dir_path: root,
    });
    for (const [name, input] of [
      ["glob", { pattern: "*.ts", dir_path: "src" }],
      ["run_shell_command", { command: "ls" }],
      ["read_file", { file_path: "src/app.ts" }],
      ["write_file", { file_path: "notas.md", content: "x" }],
    ] as const) {
      expect(await before(root, name, input)).toMatchObject({ code: 0, out: "" });
    }
  });
});

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const SETTINGS = ".gemini/settings.json";

describe("installing the guard in Gemini CLI", () => {
  it("writes it in the project's settings, out of git, and doctor and uninstall find it (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    const lint = { matcher: "write_file", hooks: [{ type: "command", command: "./lint.sh" }] };
    const mine = { ui: { theme: "Dracula" }, hooks: { BeforeTool: [lint] } };
    await writeFiles(root, { [SETTINGS]: JSON.stringify(mine) });
    const init = await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(init.code).toBe(0);
    expect(init.out).toContain("Gemini CLI: guard en .gemini/settings.json (local).");
    expect(init.out).toContain("Gemini CLI avisa antes de ejecutar un hook nuevo o cambiado");
    const settings = JSON.parse(await read(root, SETTINGS));
    expect(settings.ui).toEqual(mine.ui);
    const ours = (matcher: string) => ({
      matcher,
      hooks: [{ type: "command", command: expect.stringContaining("guard --tool gemini-cli") }],
    });
    expect(settings.hooks).toEqual({
      BeforeTool: [
        lint,
        ours("run_shell_command|write_file|replace|read_file|list_directory|glob|grep_search"),
      ],
      AfterTool: [ours("run_shell_command")],
      BeforeAgent: [{ hooks: ours("").hooks }],
    });
    expect(await read(root, ".git/info/exclude")).toContain(`/${SETTINGS}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await cli(root, ["doctor"])).out).toContain(
      "Gemini CLI: guard en .gemini/settings.json; Gemini CLI avisa antes de ejecutarlo si es nuevo o cambió.",
    );

    const { AfterTool: _, ...rest } = settings.hooks;
    await writeFiles(root, { [SETTINGS]: JSON.stringify({ ...settings, hooks: rest }) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Gemini CLI: faltan hooks de Specty en .gemini/settings.json (AfterTool); ejecuta `specty init --tools gemini-cli`.",
    );

    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(JSON.parse(await read(root, SETTINGS))).toEqual(mine);
  });

  it("writes a GEMINI.md that imports AGENTS.md, keeps what it had, and uninstall leaves it (AC5)", async () => {
    const root = await tempRepo({ ...PACKAGE, "GEMINI.md": "Reglas mías.\n" });
    const init = await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(init.out).toContain("GEMINI.md importa AGENTS.md.");
    const pointed = "@./AGENTS.md\n\nReglas mías.\n";
    expect(await read(root, "GEMINI.md")).toBe(pointed);
    expect(git(root, "status", "--porcelain")).toBe("");
    const again = await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(again.out).not.toContain("GEMINI.md importa AGENTS.md.");
    expect(await read(root, "GEMINI.md")).toBe(pointed);
    const removed = await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(removed.out).toContain("GEMINI.md sigue importando AGENTS.md.");
    expect(await read(root, "GEMINI.md")).toBe(pointed);
  });
});

describe("the end of Gemini CLI's turn", () => {
  it("sends it back with the report while specty check --changed fails, once (AC1)", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    const stop = (active: boolean) =>
      cli(root, ["hook", "agent-stop", "gemini-cli"], {
        stdin: JSON.stringify({
          session_id: "s1",
          cwd: root,
          hook_event_name: "AfterAgent",
          prompt: "haz la tarea",
          prompt_response: "hecho",
          stop_hook_active: active,
        }),
      });
    const back = await stop(false);
    expect(back.code).toBe(0);
    const reply = JSON.parse(back.out);
    expect(reply.decision).toBe("deny");
    expect(reply.reason).toContain(
      "`specty check --changed` falla; corrígelo antes de terminar el turno:",
    );
    expect(reply.reason).toContain(`FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`);
    // Already sent back once: it may end now, so that it never loops.
    expect(await stop(true)).toMatchObject({ code: 0, out: "" });
  });

  it("is offered by check --install next to the guard, once, in milliseconds (AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out).toContain(`${SETTINGS} (modificar)`);
    expect(plan.out).toContain("hook agent-stop gemini-cli");
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    const hooks = async () => JSON.parse(await read(root, SETTINGS)).hooks;
    const turn = (await hooks()).AfterAgent;
    expect(turn).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: expect.stringContaining("hook agent-stop gemini-cli"),
            timeout: 600_000,
          },
        ],
      },
    ]);
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain("agent-stop");
    await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect((await hooks()).AfterAgent).toEqual(turn);
  });
});

describe("the task card in Gemini CLI", () => {
  it("comes with each turn's prompt, and nothing outside Specty (AC3)", async () => {
    const root = await implementing();
    const turn = await gemini(root, "BeforeAgent", { prompt: "sigue" });
    expect(turn.code).toBe(0);
    expect(JSON.parse(turn.out).hookSpecificOutput).toEqual({
      hookEventName: "BeforeAgent",
      additionalContext: expect.stringContaining("TAREA T1"),
    });
    const outside = await tempRepo({ "src/app.ts": "x\n" });
    expect(await gemini(outside, "BeforeAgent", { prompt: "sigue" })).toMatchObject({
      code: 0,
      out: "",
    });
  });
});

describe("Gemini CLI's sandbox", () => {
  it("lets Specty's commits through from local settings, after the person's paths (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    const mine = { tools: { sandboxAllowedPaths: ["/opt/cache"] } };
    await writeFiles(root, { [SETTINGS]: JSON.stringify(mine) });
    const init = await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(init.out).toContain(
      "Gemini CLI: .gemini/settings.json (local) deja escribir a los comandos de Specty en la carpeta de git y en la de las worktrees cuando activas su sandbox.",
    );
    const allowed = async () => JSON.parse(await read(root, SETTINGS)).tools.sandboxAllowedPaths;
    const folders = ["/opt/cache", join(root, ".git"), `${root}.worktrees`];
    expect(await allowed()).toEqual(folders);
    await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(await allowed()).toEqual(folders);
    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(JSON.parse(await read(root, SETTINGS))).toEqual(mine);
  });

  it("opens the worktrees' folder to its tools from local settings, creating it (AC5)", async () => {
    const root = await tempRepo(PACKAGE);
    const home = `${root}.worktrees`;
    const mine = { context: { includeDirectories: ["/opt/libs"] } };
    await writeFiles(root, { [SETTINGS]: JSON.stringify(mine) });
    const args = ["init", "--language", "es", "--tools", "gemini-cli"];
    expect((await cli(root, [...args, "--dry-run"])).code).toBe(0);
    expect(existsSync(home)).toBe(false);
    const init = await cli(root, args);
    expect(init.out).toContain(
      "Gemini CLI: .gemini/settings.json (local) abre a sus herramientas la carpeta de las worktrees (`context.includeDirectories`), para trabajar en la de un cambio desde la misma sesión (`specty enter`); Gemini CLI puede preguntar una vez si confías en ella.",
    );
    const included = async () => JSON.parse(await read(root, SETTINGS)).context.includeDirectories;
    expect(await included()).toEqual(["/opt/libs", home]);
    // Gemini CLI does not start when a folder of its workspace is missing.
    expect(existsSync(home)).toBe(true);
    await cli(root, args);
    expect(await included()).toEqual(["/opt/libs", home]);
    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(JSON.parse(await read(root, SETTINGS))).toEqual(mine);
    expect(existsSync(home)).toBe(true);
  });

  it("adds no machine path to settings kept in git, and says which to add (AC4)", async () => {
    const root = await tempRepo({ ...PACKAGE, [SETTINGS]: "{}\n" });
    const init = await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(init.out).toContain(
      `Gemini CLI: .gemini/settings.json va en git, así que Specty no le añade rutas de esta máquina; si activas su sandbox, añade \`${join(root, ".git")}\`, \`${root}.worktrees\` a \`tools.sandboxAllowedPaths\` en tu configuración de usuario para que funcionen los commits de Specty.`,
    );
    expect(JSON.parse(await read(root, SETTINGS)).tools).toBeUndefined();
  });

  it("says which folder to open to its tools when the settings are kept in git (AC5)", async () => {
    const root = await tempRepo({ ...PACKAGE, [SETTINGS]: "{}\n" });
    const init = await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"]);
    expect(init.out).toContain(
      `Gemini CLI: .gemini/settings.json va en git, así que Specty no le añade la carpeta de las worktrees; para trabajar en la de un cambio desde la misma sesión (\`specty enter\`), añade \`${root}.worktrees\` a \`context.includeDirectories\` en tu configuración de usuario.`,
    );
    expect(JSON.parse(await read(root, SETTINGS)).context).toBeUndefined();
    expect(existsSync(`${root}.worktrees`)).toBe(true);
  });
});
