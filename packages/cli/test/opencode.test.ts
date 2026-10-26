// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { installFiles } from "../src/install/files";
import { installHooks } from "../src/install/hooks";
import { installOpencode } from "../src/install/opencode";
import { createGit } from "../src/io/git";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  git,
  NOW,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

/** A repository whose change is implementing T1 (`src/app.ts`, `src/app.test.ts`). */
async function implementing(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

/** What Specty's plugin sends the guard before an OpenCode tool runs. */
const opencode = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "opencode"], {
    stdin: JSON.stringify({
      cwd: root,
      session_id: "s1",
      tool_use_id: "c1",
      tool_name: tool,
      tool_input: input,
    }),
  });

const patch = (path: string) =>
  ["*** Begin Patch", `*** Add File: ${path}`, "+x", "*** End Patch"].join("\n");

describe("the guard in OpenCode", () => {
  it("judges edits by their path, with the names of OpenCode 2 and 1 (AC3)", async () => {
    const root = await implementing();
    const edit = { path: "src/app.ts", oldString: "hola", newString: "Hola" };
    expect((await opencode(root, "edit", edit)).code).toBe(0);
    expect(
      (await opencode(root, "write", { filePath: "src/app.test.ts", content: "x" })).code,
    ).toBe(0);
    const outside = await opencode(root, "write", { path: "src/other.ts", content: "x" });
    expect(outside.code).toBe(2);
    expect(outside.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.err).toContain("SIGUIENTE: trabaja dentro del alcance");
    expect((await opencode(root, "multiedit", { filePath: "src/other.ts", edits: [] })).code).toBe(
      2,
    );
  });

  it("judges patches, and commands in their workdir (AC3)", async () => {
    const root = await implementing();
    expect((await opencode(root, "patch", { patchText: patch("src/other.ts") })).code).toBe(2);
    expect(
      (await opencode(root, "apply_patch", { patchText: patch("src/app.test.ts") })).code,
    ).toBe(0);
    // Inside `src/`, `echo x > other.ts` writes `src/other.ts`.
    const shell = await opencode(root, "shell", { command: "echo x > other.ts", workdir: "src" });
    expect(shell.code).toBe(2);
    expect(shell.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect((await opencode(root, "bash", { command: "echo x > src/app.ts" })).code).toBe(0);
  });

  it("lets through the tools and events it does not know", async () => {
    const root = await implementing();
    expect((await opencode(root, "read", { path: "src/other.ts" })).code).toBe(0);
    expect((await opencode(root, "patch", {})).code).toBe(0);
    expect((await opencode(root, "shell", {})).code).toBe(0);
  });
});

/** A global OpenCode configuration of its own, as `XDG_CONFIG_HOME` points to it: Specty leaves it empty. */
async function opencodeConfig() {
  const config = await mkdtemp(join(tmpdir(), "specty-opencode-"));
  return { env: { XDG_CONFIG_HOME: config }, config };
}

const PLUGIN = ".opencode/plugins/specty.js";

type Hook = (...args: unknown[]) => Promise<void>;

/** The plugin's default export, as OpenCode 2 (`setup`) and 1 (`server`) call it. */
interface Plugin {
  readonly id: string;
  setup(ctx: unknown): Promise<void>;
  server(input: unknown): Promise<Record<string, Hook>>;
}

/** Loads the plugin `init` writes, with the guard of this build. */
async function loadPlugin(): Promise<Plugin> {
  const root = await tempRepo({ "README.md": "x\n" });
  const invocation = { command: `node "${DIST}"`, portable: false };
  const installed = await installOpencode(root, createGit(root), invocation);
  const module: { default: Plugin } = await import(pathToFileURL(join(root, installed.file)).href);
  return module.default;
}

describe("Specty's plugin for OpenCode", () => {
  it("rejects in OpenCode 2 what the guard denies, with its reason (AC2)", async () => {
    const root = await implementing();
    const plugin = await loadPlugin();
    expect(plugin.id).toBe("specty");
    const hooks = new Map<string, Hook>();
    const tool = { hook: async (name: string, run: Hook) => void hooks.set(name, run) };
    await plugin.setup({ location: { directory: root }, tool });
    const before = hooks.get("execute.before");
    const event = (tool: string, input: unknown) => ({ tool, sessionID: "s", id: "c", input });
    await expect(before?.(event("write", { path: "src/other.ts", content: "x" }))).rejects.toThrow(
      "`src/other.ts` está fuera del alcance de T1.",
    );
    await expect(
      before?.(event("edit", { path: "src/app.ts", oldString: "a", newString: "b" })),
    ).resolves.toBeUndefined();
  });

  it("does the same in OpenCode 1, and nothing outside Specty (AC2)", async () => {
    const root = await implementing();
    const plugin = await loadPlugin();
    const before = (await plugin.server({ directory: root }))["tool.execute.before"];
    const info = { tool: "bash", sessionID: "s", callID: "c" };
    const denied = before?.(info, { args: { command: "echo x > src/other.ts" } });
    await expect(denied).rejects.toThrow("SIGUIENTE: trabaja dentro del alcance");
    await expect(before?.(info, { args: { command: "ls" } })).resolves.toBeUndefined();

    const elsewhere = await mkdtemp(join(tmpdir(), "specty-plain-"));
    const free = (await plugin.server({ directory: elsewhere }))["tool.execute.before"];
    await expect(free?.(info, { args: { command: "rm -rf src" } })).resolves.toBeUndefined();
  });

  it("adds the warning after a command to the result in OpenCode 2 (AC2, AC4)", async () => {
    const root = await implementing();
    const plugin = await loadPlugin();
    const hooks = new Map<string, Hook>();
    const tool = { hook: async (name: string, run: Hook) => void hooks.set(name, run) };
    await plugin.setup({ location: { directory: root }, tool });
    const call = (id: string) => ({
      tool: "shell",
      sessionID: "s",
      id,
      input: { command: "make" },
    });
    const ok = () => [{ type: "text", text: "ok" }];
    await hooks.get("execute.before")?.(call("c1"));
    await writeFiles(root, { "src/other.ts": "generated\n" });
    const warned = { ...call("c1"), status: "completed", result: { output: "ok", content: ok() } };
    await hooks.get("execute.after")?.(warned);
    expect(warned.result.content[0]).toEqual({ type: "text", text: "ok" });
    expect(warned.result.content[1]?.text).toContain(
      "`src/other.ts` está fuera del alcance de T1.",
    );
    // Nothing else changed outside the task, so the result stays as it was.
    await hooks.get("execute.before")?.(call("c2"));
    const quiet = { ...call("c2"), status: "completed", result: { content: ok() } };
    await hooks.get("execute.after")?.(quiet);
    expect(quiet.result.content).toEqual(ok());
    // A failed tool gets no warning, and the hook never throws.
    await hooks.get("execute.before")?.(call("c3"));
    await writeFiles(root, { "src/third.ts": "x\n" });
    const failed = { ...call("c3"), status: "error", error: new Error("x") };
    await expect(hooks.get("execute.after")?.(failed)).resolves.toBeUndefined();
  });

  it("adds it to the output in OpenCode 1, only for shell commands in Specty (AC3, AC4)", async () => {
    const root = await implementing();
    const plugin = await loadPlugin();
    const hooks = await plugin.server({ directory: root });
    const info = { tool: "bash", sessionID: "s", callID: "c1", args: { command: "make" } };
    await hooks["tool.execute.before"]?.(info, { args: info.args });
    await writeFiles(root, { "src/other.ts": "generated\n" });
    const output = { title: "make", output: "ok", metadata: {} };
    await hooks["tool.execute.after"]?.(info, output);
    expect(output.output).toMatch(/^ok\n\nspecty: El comando cambió lo que el flujo no permite/);
    expect(output.output).toContain("`src/other.ts` está fuera del alcance de T1.");
    const other = { title: "", output: "x", metadata: {} };
    await hooks["tool.execute.after"]?.({ ...info, tool: "read", callID: "c2" }, other);
    expect(other.output).toBe("x");
    const elsewhere = await mkdtemp(join(tmpdir(), "specty-plain-"));
    const plain = { title: "", output: "x", metadata: {} };
    await (await plugin.server({ directory: elsewhere }))["tool.execute.after"]?.(info, plain);
    expect(plain.output).toBe("x");
  });
});

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

describe("installing the plugin in OpenCode", () => {
  it("writes it to the project's .opencode/plugins/ and leaves the global configuration alone (AC2, AC9)", async () => {
    const { env, config } = await opencodeConfig();
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    const result = await cli(root, ["init", "--language", "es", "--tools", "opencode"], { env });
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "OpenCode: plugin del guard en .opencode/plugins/specty.js (local).",
    );
    expect(await read(root, PLUGIN)).toContain(`"node \\"${DIST}\\" guard --tool opencode"`);
    expect(await readdir(config)).toEqual([]);
    // With a machine path, the plugin stays out of git, and new copies it to the worktree (AC3).
    expect(await read(root, ".git/info/exclude")).toContain(`/${PLUGIN}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(created.out).toContain(`HOOKS DEL AGENTE COPIADOS:\n  ${PLUGIN}`);
    const folder = join(
      dirname(root),
      `${basename(root)}.worktrees`,
      CHANGE.replace("saludo-personalizado", "otro-cambio"),
    );
    expect(await read(folder, PLUGIN)).toBe(await read(root, PLUGIN));
  });

  it("versions it, for init's commit, when the command is on PATH (AC3)", async () => {
    const root = await tempRepo(PACKAGE);
    const env = testEnv();
    const installed = await installHooks({
      environment: {
        cwd: root,
        env,
        now: () => NOW,
        terminal: AGENT,
        io: { out: () => {}, err: () => {} },
        invocation: { command: "specty", portable: true },
      },
      root,
      git: createGit(root, env),
      tools: ["opencode"],
      lang: "es",
      files: installFiles(),
    });
    expect(installed.written).toContain(PLUGIN);
    expect(installed.done).toContain("OpenCode: plugin del guard en .opencode/plugins/specty.js.");
    expect(await read(root, PLUGIN)).toContain('"specty guard --tool opencode"');
    expect(await read(root, ".git/info/exclude")).not.toContain(PLUGIN);
  });

  it("installs it for a repository with opencode.json, and doctor looks for it there (AC6)", async () => {
    const { env, config } = await opencodeConfig();
    const root = await tempRepo({ "opencode.json": "{}\n" });
    await cli(root, ["init", "--language", "es"], { env });
    const doctor = await cli(root, ["doctor"], { env });
    expect(doctor.out).toContain("OpenCode: plugin del guard en .opencode/plugins/specty.js.");
    await writeFiles(root, { [PLUGIN]: 'const GUARD = "specty guard --tool opencode";\n' });
    expect((await cli(root, ["doctor"], { env })).out).toContain(
      "OpenCode: al plugin del guard le falta la comprobación tras cada comando; ejecuta `specty init --tools opencode`.",
    );
    await writeFiles(root, { [PLUGIN]: "export default {};\n" });
    const missing = await cli(root, ["doctor"], { env });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain(
      "OpenCode: falta el plugin del guard en .opencode/plugins/specty.js; ejecuta `specty init --tools opencode`.",
    );
    expect(await readdir(config)).toEqual([]);
  });

  it("names the formatter that would check the plugin (AC8)", async () => {
    const root = await tempRepo({
      ...PACKAGE,
      "biome.json": '{"files":{"includes":["**","!.specty"]}}\n',
    });
    await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    expect((await cli(root, ["doctor"])).out).toContain(
      'Biome también revisa .opencode/plugins/specty.js, que escribe Specty: añade "!.opencode/plugins/specty.js" en biome.json (files.includes).',
    );
  });
});
