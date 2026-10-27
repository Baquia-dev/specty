// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { installFiles } from "../src/install/files";
import { installOpencode, planOpencodeStop } from "../src/install/opencode";
import { createGit } from "../src/io/git";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  folderOf,
  person,
  type Run,
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

type Hook = (...args: unknown[]) => Promise<void>;

/** The plugin's default export, as OpenCode 2 (`setup`) and 1 (`server`) call it. */
interface Plugin {
  readonly id: string;
  setup(ctx: unknown): Promise<unknown>;
  server(input: unknown): Promise<Record<string, Hook>>;
}

/**
 * Loads the plugin `init` writes, with the guard of this build; with `stop`, as `check --install`
 * leaves it, checking the end of each turn.
 */
async function loadPlugin(stop?: number): Promise<Plugin> {
  const root = await tempRepo({ "README.md": "x\n" });
  const invocation = { command: `node "${DIST}"`, portable: false };
  const installed = await installOpencode(root, createGit(root), invocation);
  if (stop !== undefined) await planOpencodeStop(root, installFiles(), stop);
  const module: { default: Plugin } = await import(pathToFileURL(join(root, installed.file)).href);
  return module.default;
}

/** OpenCode 1's client, keeping what the plugin sends to its sessions. */
function client() {
  const sent: unknown[] = [];
  return { sent, session: { prompt: async (request: unknown) => void sent.push(request) } };
}

/** OpenCode 1's events for session `s`. */
const sessionEvent = (type: string) => ({ event: { type, properties: { sessionID: "s" } } });

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

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A repository whose `specty check --changed` fails: a marker without an issue. */
async function failing(): Promise<string> {
  const config = `${CONFIG()}checks:\n  levels: { secrets: off }\n`;
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await writeFiles(root, {
    "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
  });
  return root;
}

describe("Specty's plugin and OpenCode's sessions", () => {
  it("adds the card to OpenCode 1's session once it compacted, asking for no reply (AC1)", async () => {
    const root = await implementing();
    const plugin = await loadPlugin();
    const opencode = client();
    await (await plugin.server({ directory: root, client: opencode })).event?.(
      sessionEvent("session.compacted"),
    );
    // The guard runs with the test's own environment, so only the card's content is compared.
    const card = { type: "text", text: expect.stringContaining("TAREA T1: Saludar por nombre") };
    expect(opencode.sent).toEqual([{ path: { id: "s" }, body: { noReply: true, parts: [card] } }]);
    const elsewhere = await mkdtemp(join(tmpdir(), "specty-plain-"));
    const outside = client();
    await (await plugin.server({ directory: elsewhere, client: outside })).event?.(
      sessionEvent("session.compacted"),
    );
    expect(outside.sent).toEqual([]);
  });

  it("puts the card in OpenCode 2's next model call after a compaction (AC1)", async () => {
    const root = await implementing();
    const plugin = await loadPlugin();
    const hooks = new Map<string, Hook>();
    const register = { hook: async (name: string, run: Hook) => void hooks.set(name, run) };
    await plugin.setup({ location: { directory: root }, tool: register, session: register });
    await hooks.get("compaction")?.({ sessionID: "s", messages: [], system: [] });
    const call = { sessionID: "s", messages: [], system: [] as unknown[] };
    await hooks.get("context")?.(call);
    expect(call.system).toEqual([
      { type: "text", text: expect.stringContaining("TAREA T1: Saludar por nombre") },
    ]);
    const later = { sessionID: "s", messages: [], system: [] as unknown[] };
    await hooks.get("context")?.(later);
    expect(later.system).toEqual([]);
  });

  it("sends OpenCode 1's session back to work while specty check --changed fails, once in a row (AC3)", async () => {
    const root = await failing();
    const opencode = client();
    const hooks = await (await loadPlugin(600)).server({ directory: root, client: opencode });
    await hooks.event?.(sessionEvent("session.idle"));
    expect(opencode.sent).toHaveLength(1);
    expect(opencode.sent[0]).toMatchObject({ path: { id: "s" } });
    expect(JSON.stringify(opencode.sent[0])).toContain(
      "`specty check --changed` falla; corrígelo antes de terminar el turno:",
    );
    // The turn it sent back may end; the next one is checked again.
    await hooks.event?.(sessionEvent("session.idle"));
    expect(opencode.sent).toHaveLength(1);
    await hooks.event?.(sessionEvent("session.idle"));
    expect(opencode.sent).toHaveLength(2);
  });

  it("checks no end of turn until check --install turns it on (AC2)", async () => {
    const root = await failing();
    const opencode = client();
    await (await (await loadPlugin()).server({ directory: root, client: opencode })).event?.(
      sessionEvent("session.idle"),
    );
    expect(opencode.sent).toEqual([]);
  });

  it("sends OpenCode 2's session back to work from its events (AC3)", async () => {
    const root = await failing();
    const plugin = await loadPlugin(600);
    const sent: unknown[] = [];
    const tool = { hook: async () => {} };
    const session = {
      hook: async () => {},
      prompt: async (request: unknown) => void sent.push(request),
    };
    const event = {
      subscribe: async function* () {
        yield { type: "session.idle", properties: { sessionID: "s" } };
      },
    };
    const stop = await plugin.setup({ location: { directory: root }, tool, session, event });
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 20_000 });
    expect(sent[0]).toMatchObject({ sessionID: "s" });
    expect(JSON.stringify(sent[0])).toContain("FALLA todo");
    if (typeof stop === "function") stop();
  });
});

/** A repository with a change in its own folder, which OpenCode's session `s1` entered. */
async function entered(): Promise<{ readonly root: string; readonly folder: string }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await opencode(root, "bash", { command: `specty enter ${CHANGE}` })).code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** The guard's answer to a plugin that runs the tool with the input it gives back. */
const redirected = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "opencode"], {
    stdin: JSON.stringify({
      cwd: root,
      session_id: "s1",
      tool_use_id: "c1",
      tool_name: tool,
      tool_input: input,
      redirects: true,
    }),
  });

const inputOf = async (run: Promise<Run>): Promise<unknown> => {
  const { out } = await run;
  return out === "" ? undefined : JSON.parse(out).tool_input;
};

describe("OpenCode in the folder of the change its conversation entered", () => {
  it("moves files and patches to the change's folder, judged by its rules (AC1)", async () => {
    const { root, folder } = await entered();
    const written = { filePath: SPEC_PATH, content: "x" };
    expect(await inputOf(redirected(root, "write", written))).toEqual({
      filePath: join(folder, SPEC_PATH),
      content: "x",
    });
    expect(await inputOf(redirected(root, "read", { path: join(root, "src/app.ts") }))).toEqual({
      path: join(folder, "src/app.ts"),
    });
    const moved = await inputOf(redirected(root, "apply_patch", { patchText: patch(SPEC_PATH) }));
    expect(moved).toEqual({ patchText: patch(join(folder, SPEC_PATH)) });
    // Already there, or outside the repository: nothing moves.
    expect((await redirected(root, "read", { filePath: join(folder, "src/app.ts") })).out).toBe("");
    expect((await redirected(root, "read", { filePath: "/etc/hosts" })).out).toBe("");
    const code = await redirected(root, "edit", {
      filePath: "src/app.ts",
      oldString: "hola",
      newString: "adiós",
    });
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("runs searches and commands in the change's folder, or the same folder inside it (AC2)", async () => {
    const { root, folder } = await entered();
    expect(await inputOf(redirected(root, "glob", { pattern: "*.ts" }))).toEqual({
      pattern: "*.ts",
      path: folder,
    });
    expect(await inputOf(redirected(root, "grep", { pattern: "x", path: "src" }))).toEqual({
      pattern: "x",
      path: join(folder, "src"),
    });
    expect(await inputOf(redirected(root, "bash", { command: "ls" }))).toEqual({
      command: "ls",
      workdir: folder,
    });
    // A conversation that entered nothing searches and runs where it was.
    const other = await tempRepo(APP);
    expect((await redirected(other, "glob", { pattern: "*.ts" })).out).toBe("");
    expect((await redirected(other, "bash", { command: "ls" })).out).toBe("");
  });

  it("leaves an older plugin's tools as they were, blocking with the path inside (AC3)", async () => {
    const { root, folder } = await entered();
    const written = await opencode(root, "write", { filePath: "notas.md", content: "x" });
    expect(written).toMatchObject({ code: 2, out: "" });
    expect(written.err).toContain(
      `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(folder, "notas.md")}\`.`,
    );
  });

  it("makes the plugin run each tool with the input the guard gives back (AC1)", async () => {
    const { root, folder } = await entered();
    const plugin = await loadPlugin();
    const before = (await plugin.server({ directory: root }))["tool.execute.before"];
    const info = { tool: "write", sessionID: "s1", callID: "c2" };
    const args = { filePath: "notas.md", content: "x" };
    await before?.(info, { args });
    expect(args).toEqual({ filePath: join(folder, "notas.md"), content: "x" });
    const hooks = new Map<string, Hook>();
    const tool = { hook: async (name: string, run: Hook) => void hooks.set(name, run) };
    await plugin.setup({ location: { directory: root }, tool });
    const input: Record<string, unknown> = { command: "ls", workdir: "src" };
    await hooks.get("execute.before")?.({ tool: "shell", sessionID: "s1", id: "c3", input });
    expect(input).toEqual({ command: "ls", workdir: join(folder, "src") });
  });
});
