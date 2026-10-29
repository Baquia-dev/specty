// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  BUTTON_TEST,
  CHANGE,
  cli,
  folderOf,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const ADVICE =
  "Para el siguiente cambio conviene una sesión nueva del agente (en Claude Code, `/clear`): esta ya lleva unos 620.000 tokens de contexto, y cada paso los vuelve a leer.";

/**
 * Claude Code's configuration folder; with `context`, it keeps the transcript of `sesion-1`,
 * whose last answer read that many tokens.
 */
async function claudeFolder(context?: number): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "claude-config-"));
  if (context === undefined) return folder;
  const project = join(folder, "projects", "-Users-ana-repo");
  await mkdir(project, { recursive: true });
  const answer = (read: number) => ({
    type: "assistant",
    message: {
      model: "claude-opus-5-5",
      content: [],
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: read,
        output_tokens: 300,
      },
    },
  });
  const lines = [
    answer(10_000),
    { type: "user", message: { content: "sigue" } },
    answer(context - 5002),
  ];
  await writeFile(
    join(project, "sesion-1.jsonl"),
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
  return folder;
}

/**
 * A quick change made by `agent`'s session, accepted by the person with `env`: what the
 * acceptance says. Its ccusage fails, so that its consumption does not get in the way.
 */
async function acceptedQuick(
  agent: Record<string, string>,
  env: Record<string, string>,
): Promise<string> {
  const root = await tempRepo({
    ...APP,
    "src/button.ts": "Sing in\n",
    ".gitignore": "node_modules\n",
  });
  const created = await cli(root, ["new", "--worktree", "--kind", "quick", "Corregir botón"], {
    env: agent,
  });
  expect(created.code).toBe(0);
  const id = `${CHANGE.slice(0, 8)}-corregir-boton`;
  const folder = folderOf(root, id);
  await writeFiles(folder, {
    [`.specty/changes/${id}/spec.md`]:
      "---\nkind: quick\n---\n\n# Corregir botón\n\n## Objetivo\n\nDice «Sing in».\n\n## Archivos\n\n- modificar src/button.ts — texto\n\n## Tareas\n\n- [ ] T1: Corregir texto\n  - files: src/button.ts\n  - type: fix\n",
  });
  expect((await cli(folder, ["propose"], { env: agent })).code).toBe(0);
  expect((await cli(folder, ["approve"], { terminal: person() })).code).toBe(0);
  await cli(folder, ["next"], { env: agent });
  await writeFiles(folder, { "src/button.ts": "Sign in\n", "src/button.test.ts": BUTTON_TEST });
  const done = await cli(folder, ["task", "done", "T1", "--summary", "Texto corregido"], {
    env: agent,
  });
  expect(done.code).toBe(0);
  const bin = join(folder, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "ccusage"), "#!/usr/bin/env node\nprocess.exit(1);\n");
  await chmod(join(bin, "ccusage"), 0o755);
  const accepted = await cli(folder, ["accept"], { terminal: person(), env });
  expect(accepted.code).toBe(0);
  expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
  return accepted.out;
}

/** Claude Code's session `sesion-1`, with its configuration in `folder`. */
const claudeCode = (folder: string) => ({
  CLAUDECODE: "1",
  CLAUDE_CODE_SESSION_ID: "sesion-1",
  CLAUDE_CONFIG_DIR: folder,
});

describe("the advice of a fresh session at the closing", () => {
  it("AC1: comes when the agent's session read more than 150,000 tokens", async () => {
    const folder = await claudeFolder(620_002);
    const out = await acceptedQuick(claudeCode(folder), { CLAUDE_CONFIG_DIR: folder });
    expect(out).toContain(ADVICE);
  });

  it("AC2: does not come with 150,000 tokens or fewer, without a transcript or a session", async () => {
    const small = await claudeFolder(150_000);
    expect(await acceptedQuick(claudeCode(small), { CLAUDE_CONFIG_DIR: small })).not.toContain(
      "sesión nueva",
    );
    const empty = await claudeFolder();
    expect(await acceptedQuick(claudeCode(empty), { CLAUDE_CONFIG_DIR: empty })).not.toContain(
      "sesión nueva",
    );
    // No agent named its session: nothing to read.
    const big = await claudeFolder(620_002);
    expect(await acceptedQuick({}, { CLAUDE_CONFIG_DIR: big })).not.toContain("sesión nueva");
  });
});

describe("Specty's card after a /clear", () => {
  it("AC3: Claude Code's session start brings back what `specty next` says", async () => {
    const root = await tempRepo(APP);
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    const card = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        session_id: "s1",
        cwd: root,
        hook_event_name: "SessionStart",
        source: "clear",
      }),
    });
    expect(card.code).toBe(0);
    expect(card.out).toContain("TAREA T1: Saludar por nombre");
    expect(card.out).toBe((await cli(root, ["next"])).out);
  });
});
