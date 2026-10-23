// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { installOpencode } from "../src/install/opencode";
import { exists } from "../src/io/files";
import { APP, cli, DIST, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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

/** A global OpenCode configuration of its own, as `XDG_CONFIG_HOME` points to it. */
async function opencodeConfig() {
  const config = await mkdtemp(join(tmpdir(), "specty-opencode-"));
  return { env: { XDG_CONFIG_HOME: config }, file: join(config, "opencode/plugins/specty.js") };
}

type Hook = (...args: unknown[]) => Promise<void>;

/** The plugin's default export, as OpenCode 2 (`setup`) and 1 (`server`) call it. */
interface Plugin {
  readonly id: string;
  setup(ctx: unknown): Promise<void>;
  server(input: unknown): Promise<Record<string, Hook>>;
}

/** Loads the plugin `init` wrote, with the guard of this build. */
async function loadPlugin(): Promise<Plugin> {
  const { env } = await opencodeConfig();
  const file = await installOpencode(env, { command: `node "${DIST}"`, portable: false });
  const module: { default: Plugin } = await import(pathToFileURL(file).href);
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
});

describe("installing the plugin in OpenCode", () => {
  it("writes it to the global configuration and leaves the repository alone (AC1)", async () => {
    const { env, file } = await opencodeConfig();
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    const result = await cli(root, ["init", "--language", "es", "--tools", "opencode"], { env });
    expect(result.code).toBe(0);
    expect(result.out).toContain(`OpenCode: plugin del guard en ${file}, tu configuración global`);
    expect(await readFile(file, "utf8")).toContain(`"node \\"${DIST}\\" guard --tool opencode"`);
    expect(await exists(join(root, ".opencode"))).toBe(false);
  });

  it("installs it for a repository with opencode.json, and doctor checks it (AC4)", async () => {
    const { env, file } = await opencodeConfig();
    const root = await tempRepo({ "opencode.json": "{}\n" });
    await cli(root, ["init", "--language", "es"], { env });
    const doctor = await cli(root, ["doctor"], { env });
    expect(doctor.out).toContain(`OpenCode: plugin del guard en ${file}.`);
    await writeFile(file, "export default {};\n");
    const missing = await cli(root, ["doctor"], { env });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain(
      `OpenCode: falta el plugin del guard en ${file}; ejecuta \`specty init --tools opencode\`.`,
    );
  });
});
