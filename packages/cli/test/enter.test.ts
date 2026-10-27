// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  person,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const EPIC = CHANGE.replace("saludo-personalizado", "panel");
const SLICE = CHANGE.replace("saludo-personalizado", "inicio");

/** Codex's hook before a tool call of the conversation `session`, with the tool working in `cwd`. */
const codex = (cwd: string, session: string, tool: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({ cwd, session_id: session, hook_event_name: "PreToolUse", ...tool }),
  });

const bash = (cwd: string, session: string, command: string) =>
  codex(cwd, session, { tool_name: "Bash", tool_input: { command } });

/**
 * The hook of a tool that cannot run the input the guard gives back: OpenCode's plugin from before
 * it could (`redirects`). For such a tool, the guard blocks what would go elsewhere.
 */
const older = (cwd: string, session: string, tool: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "opencode"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      tool_use_id: "c1",
      tool_name: tool,
      tool_input: input,
    }),
  });

const olderBash = (cwd: string, session: string, command: string) =>
  older(cwd, session, "bash", { command });

/** That tool's `apply_patch` adding `path`. */
const add = (cwd: string, session: string, path: string) =>
  older(cwd, session, "apply_patch", {
    patchText: ["*** Begin Patch", `*** Add File: ${path}`, "+x", "*** End Patch"].join("\n"),
  });

/** A repository with two open changes, each in its own folder. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

const EPIC_SPEC = `---
kind: epic
---

# Panel

## Objetivo

El estudiante ve su progreso.

## Fuera de alcance

- Exportarlo.

## Supuestos

- A1: El progreso ya se guarda.

## Criterios de aceptación

- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.

## Cortes

- C1: Inicio
  - ac: AC1
`;

describe("specty enter, as the guard judges it", () => {
  it("binds the conversation to the change's folder, one open change at a time (AC1)", async () => {
    const { root, first, second } = await twoChanges();
    expect((await bash(root, "s1", `specty enter ${CHANGE}`)).code).toBe(0);
    expect((await bash(first, "s1", `specty enter ${CHANGE}`)).code).toBe(0);
    const denied = await bash(root, "s1", `specty enter ${OTHER}`);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
    );
    expect(denied.err).toContain(`abre otra sesión en \`${second}\` para trabajar en ese.`);
    expect((await bash(root, "s2", `specty enter ${OTHER}`)).code).toBe(0);
  });

  it("says where the conversation works now, with what `next` says there (AC1)", async () => {
    const { root, first } = await twoChanges();
    const entered = await cli(root, ["enter", CHANGE]);
    expect(entered.code).toBe(0);
    const lines = entered.out.split("\n");
    expect(lines[0]).toContain(`SPECTY · ${CHANGE}`);
    expect(lines[1]).toBe(
      `Esta conversación trabaja ahora en \`${first}\`: lee, escribe y ejecuta los comandos allí, con las rutas de esa carpeta.`,
    );
    expect(entered.out).toBe(
      `${lines[0]}\n${lines[1]}\n${(await cli(first, ["next"])).out.split("\n").slice(1).join("\n")}`,
    );
  });

  it("says when the change has no folder of its own, and binds nothing (AC2)", async () => {
    const { root } = await twoChanges();
    const id = "20260101-sin-carpeta";
    expect((await bash(root, "s1", `specty enter ${id}`)).code).toBe(0);
    expect((await bash(root, "s1", "pnpm test")).code).toBe(0);
    const said = await cli(root, ["enter", id]);
    expect(said.code).toBe(2);
    expect(said.out).toContain(`El cambio ${id} no tiene carpeta propia en \``);
    expect(said.out).toContain(
      "SIGUIENTE: comprueba el id con `specty status`; si el cambio vive en esta carpeta, sigue con `specty next`.",
    );
  });

  it("lets the conversation of an epic enter its slices", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "--kind", "epic", "Panel"])).code).toBe(0);
    const epic = folderOf(root, EPIC);
    await writeFiles(epic, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
    expect((await cli(epic, ["propose"])).code).toBe(0);
    expect((await cli(epic, ["approve"], { terminal: person() })).code).toBe(0);
    expect((await bash(root, "s1", `specty enter ${EPIC}`)).code).toBe(0);
    const slice = ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1"];
    expect((await cli(epic, slice)).code).toBe(0);
    expect((await bash(root, "s1", `specty enter ${SLICE}`)).code).toBe(0);
    expect((await bash(root, "s1", `specty enter ${EPIC}`)).code).toBe(2);
  });

  it("blocks a file outside the change's folder with the same path inside it (AC3)", async () => {
    const { root, first, second } = await twoChanges();
    await bash(root, "s1", `specty enter ${CHANGE}`);
    for (const path of ["src/nuevo.ts", join(root, "src/nuevo.ts"), join(second, "src/nuevo.ts")]) {
      const denied = await add(root, "s1", path);
      expect(denied.code).toBe(2);
      expect(denied.err).toContain("está fuera de la carpeta en la que trabaja esta conversación.");
      expect(denied.err).toContain(
        `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(first, "src/nuevo.ts")}\`.`,
      );
    }
    // Inside it, its change's rules judge: the spec is open while drafted, the code is not yet.
    expect((await add(root, "s1", join(first, SPEC_PATH))).code).toBe(0);
    const code = await add(root, "s1", join(first, "src/nuevo.ts"));
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("blocks a command that would run outside the change's folder, with how to run it there (AC4)", async () => {
    const { root, first } = await twoChanges();
    await bash(root, "s1", `specty enter ${CHANGE}`);
    const denied = await olderBash(root, "s1", "pnpm test");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta conversación trabaja en \`${first}\`: este comando correría fuera de esa carpeta.`,
    );
    expect(denied.err).toContain(`SIGUIENTE: ejecútalo allí: \`cd '${first}' && pnpm test\`.`);
    expect((await olderBash(root, "s1", `cd '${first}' && pnpm test`)).code).toBe(0);
    expect((await olderBash(first, "s1", "pnpm test")).code).toBe(0);
    expect((await olderBash(first, "s1", `cd '${root}' && ls`)).code).toBe(2);
    // There, its change's rules judge the command.
    const code = await olderBash(first, "s1", "echo x > src/app.ts");
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("tells Claude Code to enter with EnterWorktree, and leaves its sessions as they were (AC5)", async () => {
    const { root } = await twoChanges();
    const claude = (tool: Record<string, unknown>) =>
      cli(root, ["guard", "--tool", "claude-code"], {
        stdin: JSON.stringify({
          cwd: root,
          session_id: "s1",
          hook_event_name: "PreToolUse",
          ...tool,
        }),
      });
    const denied = await claude({
      tool_name: "Bash",
      tool_input: { command: `specty enter ${CHANGE}` },
    });
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      "Claude Code entra en la carpeta de un cambio con su propia herramienta, que lleva allí toda la sesión.",
    );
    expect(denied.err).toContain(`SIGUIENTE: usa \`EnterWorktree\` con \`name: "${CHANGE}"\`.`);
    // After `ExitWorktree` its session is back in the main folder, and works there.
    expect((await claude({ tool_name: "EnterWorktree", tool_input: { name: CHANGE } })).code).toBe(
      0,
    );
    const written = await claude({
      tool_name: "Write",
      tool_input: { file_path: join(root, "src/app.ts") },
    });
    expect(written.err).toContain("No hay un cambio activo y `src/app.ts` es código gobernado");
  });
});

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

describe("the end of the turn of a conversation that entered a change", () => {
  it("runs specty check --changed in that change's folder (AC4)", async () => {
    const checks = "checks:\n  levels: { secrets: off }\n";
    const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${checks}` });
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(folderOf(root), {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
    });
    await bash(root, "s1", `specty enter ${CHANGE}`);
    const stop = (session: string) =>
      cli(root, ["hook", "agent-stop", "codex"], {
        stdin: JSON.stringify({ hook_event_name: "Stop", session_id: session, cwd: root }),
      });
    const sent = await stop("s1");
    expect(JSON.parse(sent.out).reason).toContain(
      `FALLA todo\n  src/app.ts:2 ${TODO} sin referencia a un issue`,
    );
    // Another conversation works in the main folder, where nothing fails.
    expect((await stop("s2")).out).toBe("");
  });
});
