// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { APP, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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

/** A Codex user configuration of its own, as `CODEX_HOME` points to it. */
async function codexHome() {
  const home = await mkdtemp(join(tmpdir(), "specty-codex-home-"));
  const file = join(home, "hooks.json");
  const read = async () => JSON.parse(await readFile(file, "utf8"));
  return { env: { CODEX_HOME: home }, file, read };
}

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

describe("installing the guard in Codex", () => {
  it("writes it to the user's hooks.json, keeps other hooks and leaves the repository alone (AC1)", async () => {
    const { env, file, read } = await codexHome();
    const stop = { hooks: [{ type: "command", command: "echo bye" }] };
    await writeFile(file, JSON.stringify({ description: "mine", hooks: { Stop: [stop] } }));
    const root = await tempRepo(PACKAGE);
    const result = await cli(root, ["init", "--language", "es", "--tools", "codex"], { env });
    expect(result.code).toBe(0);
    expect(result.out).toContain(`Codex: guard en ${file}, tu configuración de usuario`);
    expect(result.out).toContain("en Codex, abre `/hooks` y márcalo como de confianza");
    const hooks = await read();
    expect(hooks).toMatchObject({ description: "mine", hooks: { Stop: [stop] } });
    const guard = { type: "command", command: expect.stringContaining("guard --tool codex") };
    expect(hooks.hooks.PreToolUse).toMatchObject([
      { matcher: "^(Bash|apply_patch)$", hooks: [guard] },
    ]);
    expect(hooks.hooks.PostToolUse).toMatchObject([{ matcher: "^Bash$", hooks: [guard] }]);
    expect(await exists(join(root, ".codex"))).toBe(false);

    await cli(root, ["init", "--tools", "codex"], { env });
    expect((await read()).hooks.PreToolUse).toHaveLength(1);
  });

  it("installs it for a repository with .codex/, and doctor checks it (AC4)", async () => {
    const { env, file } = await codexHome();
    const root = await tempRepo({ ...PACKAGE, ".codex/config.toml": 'model = "gpt-5"\n' });
    await cli(root, ["init", "--language", "es"], { env });
    expect((await cli(root, ["doctor"], { env })).out).toContain(
      `Codex: guard en ${file}; Codex lo ejecuta cuando confías en él con \`/hooks\`.`,
    );
    await writeFile(file, "{}\n");
    const missing = await cli(root, ["doctor"], { env });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain(
      `Codex: falta el guard en ${file}; ejecuta \`specty init --tools codex\`.`,
    );
  });
});
