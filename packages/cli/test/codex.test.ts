// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { installFiles } from "../src/install/files";
import { installHooks } from "../src/install/hooks";
import { createGit } from "../src/io/git";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  git,
  NOW,
  person,
  type Run,
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

/** The hook Codex runs before (or after) a tool call, with its event on stdin. */
const codex = (root: string, event: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({ cwd: root, session_id: "s1", hook_event_name: "PreToolUse", ...event }),
  });

const patch = (...lines: string[]) => ["*** Begin Patch", ...lines, "*** End Patch"].join("\n");

/** Codex's `apply_patch`: the patch travels in `tool_input.command`. */
const applyPatch = (root: string, text: string) =>
  codex(root, { tool_name: "apply_patch", tool_use_id: "call_1", tool_input: { command: text } });

describe("the guard in Codex", () => {
  it("lets a patch within the task through and blocks the rest (AC2)", async () => {
    const root = await implementing();
    const inside = patch(
      "*** Update File: src/app.ts",
      "@@",
      "+export const name = 'Ana';",
      "*** Add File: src/app.test.ts",
      "+test",
    );
    expect((await applyPatch(root, inside)).code).toBe(0);

    const outside = await applyPatch(
      root,
      patch("*** Update File: src/app.ts", "@@", "+b", "*** Add File: src/other.ts", "+x"),
    );
    expect(outside.code).toBe(2);
    expect(outside.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.err).toContain(
      "SIGUIENTE: trabaja dentro del alcance o pídelo con `specty scope add src/other.ts --task T1",
    );
    // A move writes the new path, and deleting a file needs scope too.
    const moved = patch("*** Update File: src/app.ts", "*** Move to: src/moved.ts", "@@", "+b");
    expect((await applyPatch(root, moved)).err).toContain("`src/moved.ts` está fuera del alcance");
    const removed = await applyPatch(root, patch("*** Delete File: src/old.ts"));
    expect(removed.err).toContain("`src/old.ts` está fuera del alcance");

    const spec = await applyPatch(root, patch(`*** Delete File: ${SPEC_PATH}`));
    expect(spec.err).toContain("La spec está aprobada y bloqueada mientras se implementa.");
    const config = await applyPatch(
      root,
      patch("*** Update File: .specty/config.yaml", "@@", "+x"),
    );
    expect(config.err).toContain("`.specty/config.yaml` lo gestiona Specty");
  });

  it("blocks code without a change, and fails open on what it does not know", async () => {
    const root = await tempRepo(APP);
    const blocked = await applyPatch(root, patch("*** Add File: src/new.ts", "+x"));
    expect(blocked.code).toBe(2);
    expect(blocked.err).toContain("No hay un cambio activo y `src/new.ts` es código gobernado");
    expect((await applyPatch(root, patch("*** Add File: docs/notes.md", "+x"))).code).toBe(0);
    expect((await codex(root, { tool_name: "update_plan", tool_input: {} })).code).toBe(0);
    expect((await cli(root, ["guard", "--tool", "codex"], { stdin: "not json" })).code).toBe(0);
  });

  it("judges Bash commands before they run and what they changed after (AC3)", async () => {
    const root = await implementing();
    const bash = (event: string, id: string, command: string) =>
      codex(root, {
        hook_event_name: event,
        tool_name: "Bash",
        tool_use_id: id,
        tool_input: { command },
      });
    const direct = await bash("PreToolUse", "call_2", "echo x > src/other.ts");
    expect(direct.code).toBe(2);
    expect(direct.err).toContain("`src/other.ts` está fuera del alcance de T1.");

    expect((await bash("PreToolUse", "call_3", "python3 gen.py")).code).toBe(0);
    await writeFiles(root, { "src/generated.ts": "x\n" });
    const after = await bash("PostToolUse", "call_3", "python3 gen.py");
    expect(after.code).toBe(2);
    expect(after.err).toContain("`src/generated.ts` está fuera del alcance de T1.");
  });
});

const bash = (root: string, command: string) =>
  codex(root, { tool_name: "Bash", tool_use_id: "call_2", tool_input: { command } });

/** A repository with a change in its own folder, which Codex's session `s1` entered. */
async function entered(): Promise<{ readonly root: string; readonly folder: string }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await bash(root, `specty enter ${CHANGE}`)).code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** What Codex runs instead (`updatedInput`), with the decision it needs; undefined when nothing. */
function rewritten(run: Run): unknown {
  if (run.out === "") return undefined;
  const output = JSON.parse(run.out).hookSpecificOutput;
  expect(output).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "allow" });
  return output.updatedInput;
}

describe("Codex in the folder of the change its conversation entered", () => {
  it("runs each command there, after a cd, judged by that change's rules (AC1)", async () => {
    const { root, folder } = await entered();
    expect(rewritten(await bash(root, "pnpm test"))).toEqual({
      command: `cd '${folder}' && pnpm test`,
    });
    const code = await bash(root, "echo x > src/app.ts");
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
    // From the change's folder itself, or for a conversation that entered nothing: as it was.
    expect((await bash(folder, "pnpm test")).out).toBe("");
    expect((await bash(await tempRepo(APP), "pnpm test")).out).toBe("");
  });

  it("writes a patch's files at the same paths inside the change's folder (AC2)", async () => {
    const { root, folder } = await entered();
    const added = await applyPatch(root, patch("*** Add File: notas.md", "+x"));
    expect(rewritten(added)).toEqual({
      command: patch(`*** Add File: ${join(folder, "notas.md")}`, "+x"),
    });
    const outside = await applyPatch(root, patch("*** Add File: /tmp/specty-notas.md", "+x"));
    expect(outside).toMatchObject({ code: 0, out: "" });
  });
});

/** A Codex user configuration of its own, as `CODEX_HOME` points to it: Specty leaves it empty. */
async function codexHome() {
  const home = await mkdtemp(join(tmpdir(), "specty-codex-home-"));
  return { env: { CODEX_HOME: home }, home };
}

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const HOOKS = ".codex/hooks.json";
const RULES = ".codex/rules/specty.rules";
const hooksOf = async (root: string) => JSON.parse(await read(root, HOOKS));

describe("installing the guard in Codex", () => {
  it("writes it to the project's .codex/hooks.json, keeps other hooks and leaves the user's configuration alone (AC1, AC9)", async () => {
    const { env, home } = await codexHome();
    const root = await tempRepo(PACKAGE);
    const stop = { hooks: [{ type: "command", command: "echo bye" }] };
    await writeFiles(root, {
      [HOOKS]: JSON.stringify({ description: "mine", hooks: { Stop: [stop] } }),
    });
    const result = await cli(root, ["init", "--language", "es", "--tools", "codex"], { env });
    expect(result.code).toBe(0);
    expect(result.out).toContain("Codex: guard en .codex/hooks.json (local); desde Codex 0.131");
    expect(result.out).toContain(
      "confía en el proyecto cuando Codex lo pregunte y revisa el hook con `/hooks`",
    );
    const hooks = await hooksOf(root);
    expect(hooks).toMatchObject({ description: "mine", hooks: { Stop: [stop] } });
    const guard = { type: "command", command: expect.stringContaining("guard --tool codex") };
    expect(hooks.hooks.PreToolUse).toMatchObject([
      { matcher: "^(Bash|apply_patch)$", hooks: [guard] },
    ]);
    expect(hooks.hooks.PostToolUse).toMatchObject([{ matcher: "^Bash$", hooks: [guard] }]);
    expect(hooks.hooks.SessionStart).toMatchObject([{ matcher: "^compact$", hooks: [guard] }]);
    expect(await readdir(home)).toEqual([]);

    await cli(root, ["init", "--tools", "codex"], { env });
    expect((await hooksOf(root)).hooks.PreToolUse).toHaveLength(1);
  });

  it("keeps a hook with a machine path out of git, and new copies it to the change's worktree (AC3)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    expect((await cli(root, ["init", "--language", "es", "--tools", "codex"])).code).toBe(0);
    expect(await read(root, ".git/info/exclude")).toContain(`/${HOOKS}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(created.out).toContain(`HOOKS DEL AGENTE COPIADOS:\n  ${HOOKS}`);
    const folder = join(
      dirname(root),
      `${basename(root)}.worktrees`,
      CHANGE.replace("saludo-personalizado", "otro-cambio"),
    );
    expect(await read(folder, HOOKS)).toBe(await read(root, HOOKS));
  });

  it("versions the hook, for init's commit, when the command is on PATH (AC3)", async () => {
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
      tools: ["codex"],
      lang: "es",
      files: installFiles(),
    });
    expect(installed.written).toContain(HOOKS);
    expect(installed.done).toContain(
      "Codex: guard en .codex/hooks.json; desde Codex 0.131 sirve a todas las worktrees del repositorio.",
    );
    expect((await hooksOf(root)).hooks.PreToolUse[0].hooks[0].command).toBe(
      "specty guard --tool codex",
    );
    expect(await read(root, ".git/info/exclude")).not.toContain(HOOKS);
  });

  it("installs it for a repository with .codex/, and doctor looks for it there (AC6)", async () => {
    const { env, home } = await codexHome();
    const root = await tempRepo({ ...PACKAGE, ".codex/config.toml": 'model = "gpt-5"\n' });
    await cli(root, ["init", "--language", "es"], { env });
    expect((await cli(root, ["doctor"], { env })).out).toContain(
      "Codex: guard en .codex/hooks.json; Codex lo ejecuta cuando confías en él con `/hooks`.",
    );
    await writeFiles(root, { [HOOKS]: "{}\n" });
    const missing = await cli(root, ["doctor"], { env });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain(
      "Codex: falta el guard en .codex/hooks.json; ejecuta `specty init --tools codex`.",
    );
    expect(await readdir(home)).toEqual([]);
  });

  it("tells, with the guard there, that the card after a compaction is missing (AC3)", async () => {
    const root = await tempRepo(PACKAGE);
    await cli(root, ["init", "--language", "es", "--tools", "codex"]);
    const hooks = await hooksOf(root);
    await writeFiles(root, {
      [HOOKS]: JSON.stringify({ hooks: { ...hooks.hooks, SessionStart: [] } }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Codex: guard en .codex/hooks.json; Codex lo ejecuta cuando confías en él con `/hooks`.",
    );
    expect(doctor.out).toContain(
      "Codex: falta la tarjeta de Specty tras compactar (SessionStart en .codex/hooks.json); ejecuta `specty init --tools codex`.",
    );
  });

  it("writes the rule that runs Specty's commands outside the sandbox, versioned, and doctor checks it (AC2, AC5)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    const init = await cli(root, ["init", "--language", "es", "--tools", "codex"]);
    expect(init.out).toContain(
      "Codex: regla en .codex/rules/specty.rules para que los comandos de Specty se ejecuten sin preguntar y fuera del sandbox",
    );
    const rule = await read(root, RULES);
    expect(rule).toContain('pattern = ["specty"]');
    expect(rule).toContain('decision = "allow"');
    // The hooks carry a machine path and stay local; the rule names none, and is versioned.
    expect(git(root, "ls-files", HOOKS)).toBe("");
    expect(git(root, "ls-files", RULES)).toBe(RULES);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await cli(root, ["doctor"])).out).toContain(
      "Codex: regla de Specty en .codex/rules/specty.rules.",
    );
    await rm(join(root, RULES));
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Codex: falta la regla de Specty en .codex/rules/specty.rules, así que cada commit de Specty pide permiso; ejecuta `specty init --tools codex`.",
    );
  });

  it("names the formatter that would check the hook file (AC8)", async () => {
    const root = await tempRepo({
      ...PACKAGE,
      "biome.json": '{"files":{"includes":["**","!.specty"]}}\n',
    });
    await cli(root, ["init", "--language", "es", "--tools", "codex"]);
    expect((await cli(root, ["doctor"])).out).toContain(
      'Biome también revisa .codex/hooks.json, que escribe Specty: añade "!.codex/hooks.json" en biome.json (files.includes).',
    );
  });
});
